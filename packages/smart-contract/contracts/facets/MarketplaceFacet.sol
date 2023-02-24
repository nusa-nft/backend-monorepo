// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "../interfaces/INusaMarketplace.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
// import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";

import "../interfaces/IERC721Receiver.sol";
import "../interfaces/IERC1155Receiver.sol";

import "@thirdweb-dev/contracts/lib/FeeType.sol";

import "../libraries/LibMeta.sol";
import "../libraries/LibDiamond.sol";
import "../libraries/LibRoyalty.sol";
import "../libraries/LibToken.sol";
import "../libraries/LibCurrencyTransfer.sol";

import {
    Modifiers,
    Listing,
    ListingParams,
    TokenType,
    ListingType,
    MAX_BPS,
    Bid,
    ListingStatus
} from "../libraries/LibAppStorage.sol";

contract MarketplaceFacet is
    INusaMarketplace,
    Modifiers,
    IERC721Receiver,
    IERC1155Receiver
{

    /*///////////////////////////////////////////////////////////////
                        ERC 165 / 721 / 1155 logic
    //////////////////////////////////////////////////////////////*/
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /*///////////////////////////////////////////////////////////////
                Listing (create-update-delete) logic
    //////////////////////////////////////////////////////////////*/
    function createListing(ListingParams calldata _params) external {
        // Get values to populate `Listing`.
        uint256 listingId = s.totalListings;
        s.totalListings += 1;

        address tokenOwner = LibMeta.msgSender();
        TokenType tokenTypeOfListing = LibToken.getTokenType(_params.assetContract);

        uint256 tokenAmountToList = LibToken.getSafeQuantity(tokenTypeOfListing, _params.quantityToList);
        require(tokenAmountToList > 0, "QUANTITY");

        uint256 startTime = _params.startTime;
        if (startTime < block.timestamp) {
            // do not allow listing to start in the past (1 hour buffer)
            require(block.timestamp - startTime < 1 hours, "ST");
            startTime = block.timestamp;
        }

        LibToken.validateOwnershipAndApproval(
            tokenOwner,
            _params.assetContract,
            _params.tokenId,
            tokenAmountToList,
            tokenTypeOfListing
        );
        
        uint256 royaltyInfoId = LibRoyalty.addRoyaltyInfo(
            _params.royaltyParams.recipients,
            _params.royaltyParams.bpsPerRecipients
        );

        Listing memory newListing = Listing({
            listingId: listingId,
            tokenOwner: tokenOwner,
            assetContract: _params.assetContract,
            tokenId: _params.tokenId,
            startTime: startTime,
            endTime: startTime + _params.secondsUntilEndTime,
            quantity: tokenAmountToList,
            currency: _params.currencyToAccept,
            reservePricePerToken: _params.reservePricePerToken,
            buyoutPricePerToken: _params.buyoutPricePerToken,
            tokenType: tokenTypeOfListing,
            listingType: _params.listingType,
            royaltyInfoId: royaltyInfoId,
            status: ListingStatus.CREATED
        });

        s.listings[listingId] = newListing;

        // Tokens listed for sale in an auction are escrowed in Marketplace.
        if (newListing.listingType == ListingType.Auction) {
            require(
                newListing.buyoutPricePerToken == 0 ||
                newListing.buyoutPricePerToken >=
                    newListing.reservePricePerToken,
                "RESERVE"
            );
            transferListingTokens(
                tokenOwner,
                address(this),
                tokenAmountToList,
                newListing
            );
        }

        emit ListingAdded(
            listingId,
            _params.assetContract,
            tokenOwner,
            newListing
        );
    }

    function updateListing(
        uint256 _listingId,
        ListingParams memory _params
    ) external {
        Listing memory targetListing = s.listings[_listingId];
        uint256 safeNewQuantity = LibToken.getSafeQuantity(targetListing.tokenType, _params.quantityToList);
        bool isAuction = targetListing.listingType == ListingType.Auction;

        require(safeNewQuantity != 0, "QUANTITY");

        // Can only edit auction listing before it starts.
        if (isAuction) {
            require(block.timestamp < targetListing.startTime, "STARTED");
            require(_params.buyoutPricePerToken >= _params.reservePricePerToken, "RESERVE");
        }

        if (_params.startTime < block.timestamp) {
            // do not allow listing to start in the past (1 hour buffer)
            require(block.timestamp - _params.startTime < 1 hours, "ST");
            _params.startTime = block.timestamp;
        }

        uint256 newStartTime = _params.startTime == 0 ? targetListing.startTime : _params.startTime;

        uint256 royaltyInfoId = LibRoyalty.updateRoyaltyInfo(
            targetListing.royaltyInfoId,
            _params.royaltyParams.recipients,
            _params.royaltyParams.bpsPerRecipients
        );
        targetListing.quantity = safeNewQuantity;
        targetListing.startTime = newStartTime;
        targetListing.buyoutPricePerToken = _params.buyoutPricePerToken;
        targetListing.currency = _params.currencyToAccept;
        targetListing.endTime = _params.secondsUntilEndTime == 0 ? _params.startTime : _params.startTime + _params.secondsUntilEndTime;
        targetListing.royaltyInfoId = royaltyInfoId;

        s.listings[_listingId] = targetListing;

        // Must validate ownership and approval of the new quantity of tokens for diret listing.
        if (targetListing.quantity != safeNewQuantity) {
            // Transfer all escrowed tokens back to the lister, to be reflected in the lister's
            // balance for the upcoming ownership and approval check.
            if (isAuction) {
                transferListingTokens(address(this), targetListing.tokenOwner, targetListing.quantity, targetListing);
            }

            LibToken.validateOwnershipAndApproval(
                targetListing.tokenOwner,
                targetListing.assetContract,
                targetListing.tokenId,
                safeNewQuantity,
                targetListing.tokenType
            );

            // Escrow the new quantity of tokens to list in the auction.
            if (isAuction) {
                transferListingTokens(targetListing.tokenOwner, address(this), safeNewQuantity, targetListing);
            }
        }

        emit ListingUpdated(_listingId, targetListing.tokenOwner);
    }

    function getListing(uint256 _listingId) external view returns (Listing memory) {
        return s.listings[_listingId];
    }

    function cancelListing(uint256 _listingId) external onlyListingCreator(_listingId) onlyExistingListing(_listingId) {
        Listing memory _targetListing = s.listings[_listingId];

        if (_targetListing.listingType == ListingType.Auction) {
            Bid memory _winningBid = s.winningBid[_listingId];

            require(_winningBid.bidder == address(0), "Marketplace: bids already made.");

            s.listings[_listingId].status = ListingStatus.CANCELLED;

            transferListingTokens(address(this), _targetListing.tokenOwner, _targetListing.quantity, _targetListing);

            emit ListingRemoved(_listingId, _targetListing.tokenOwner);
        }

        if (_targetListing.listingType == ListingType.Direct) {
            s.listings[_listingId].status = ListingStatus.CANCELLED;
            emit ListingRemoved(_listingId, _targetListing.tokenOwner);
        }
    }

    function buy(
        uint256 _listingId,
        address _buyFor,
        uint256 _quantityToBuy,
        address _currency,
        uint256 _totalPrice
    ) external payable {
        Listing memory targetListing = s.listings[_listingId];
        address payer = LibMeta.msgSender();

        // Check whether the settled total price and currency to use are correct.
        require(
            _currency == targetListing.currency && _totalPrice == (targetListing.buyoutPricePerToken * _quantityToBuy),
            "!PRICE"
        );

        executeSale(
            targetListing,
            payer,
            _buyFor,
            targetListing.currency,
            targetListing.buyoutPricePerToken * _quantityToBuy,
            _quantityToBuy
        );
    }

    function executeSale(
        Listing memory _targetListing,
        address _payer,
        address _receiver,
        address _currency,
        uint256 _currencyAmountToTransfer,
        uint256 _listingTokenAmountToTransfer
    ) internal {
        validateDirectListingSale(
            _targetListing,
            _payer,
            _listingTokenAmountToTransfer,
            _currency,
            _currencyAmountToTransfer
        );

        _targetListing.quantity -= _listingTokenAmountToTransfer;
        if (_targetListing.quantity == 0) {
            _targetListing.status = ListingStatus.COMPLETED;
        }
        s.listings[_targetListing.listingId] = _targetListing;

        payout(_payer, _targetListing.tokenOwner, _currency, _currencyAmountToTransfer, _targetListing);
        transferListingTokens(_targetListing.tokenOwner, _receiver, _listingTokenAmountToTransfer, _targetListing);

        emit NewSale(
            _targetListing.listingId,
            _targetListing.assetContract,
            _targetListing.tokenOwner,
            _receiver,
            _listingTokenAmountToTransfer,
            _currencyAmountToTransfer
        );
    }

    function bid(
        uint256 _listingId,
        uint256 _quantityWanted,
        address _currency,
        uint256 _pricePerToken
    ) external payable {
        Listing memory targetListing = s.listings[_listingId];

        require(
            targetListing.endTime > block.timestamp && targetListing.startTime < block.timestamp,
            "inactive listing."
        );
        require(
            targetListing.listingType == ListingType.Auction,
            "can not bid on direct listing"
        );

        // Both - (1) offers to direct listings, and (2) bids to auctions - share the same structure.
        Bid memory newBid = Bid({
            listingId: _listingId,
            bidder: LibMeta.msgSender(),
            quantityWanted: _quantityWanted,
            currency: _currency,
            pricePerToken: _pricePerToken,
            totalPrice: _pricePerToken * _quantityWanted
        });

        // A bid to an auction must be made in the auction's desired currency.
        require(newBid.currency == targetListing.currency, "must use approved currency to bid");
        require(newBid.pricePerToken != 0, "bidding zero amount");

        // A bid must be made for all auction items.
        newBid.quantityWanted = LibToken.getSafeQuantity(targetListing.tokenType, targetListing.quantity);

        handleBid(targetListing, newBid);
    }


    /// @dev Processes an incoming bid in an auction.
    function handleBid(Listing memory _targetListing, Bid memory _incomingBid) internal {
        Bid memory currentWinningBid = s.winningBid[_targetListing.listingId];
        uint256 currentOfferAmount = currentWinningBid.pricePerToken * currentWinningBid.quantityWanted;
        uint256 incomingOfferAmount = _incomingBid.pricePerToken * _incomingBid.quantityWanted;
        address _nativeTokenWrapper = s.nativeTokenWrapper;

        // Close auction and execute sale if there's a buyout price and incoming offer amount is buyout price.
        if (
            _targetListing.buyoutPricePerToken > 0 &&
            incomingOfferAmount >= _targetListing.buyoutPricePerToken * _targetListing.quantity
        ) {
            _closeAuctionForBidder(_targetListing, _incomingBid);
        } else {
            /**
             *      If there's an existng winning bid, incoming bid amount must be bid buffer % greater.
             *      Else, bid amount must be at least as great as reserve price
             */
            require(
                isNewWinningBid(
                    _targetListing.reservePricePerToken * _targetListing.quantity,
                    currentOfferAmount,
                    incomingOfferAmount
                ),
                "not winning bid."
            );

            // Update the winning bid and listing's end time before external contract calls.
            s.winningBid[_targetListing.listingId] = _incomingBid;

            if (_targetListing.endTime - block.timestamp <= s.timeBuffer) {
                _targetListing.endTime += s.timeBuffer;
                s.listings[_targetListing.listingId] = _targetListing;
            }
        }

        // Payout previous highest bid.
        if (currentWinningBid.bidder != address(0) && currentOfferAmount > 0) {
            LibCurrencyTransfer.transferCurrencyWithWrapper(
                _targetListing.currency,
                address(this),
                currentWinningBid.bidder,
                currentOfferAmount,
                _nativeTokenWrapper
            );
        }

        // Collect incoming bid
        LibCurrencyTransfer.transferCurrencyWithWrapper(
            _targetListing.currency,
            _incomingBid.bidder,
            address(this),
            incomingOfferAmount,
            _nativeTokenWrapper
        );

        emit NewBid(
            _targetListing.listingId,
            _incomingBid.bidder,
            _incomingBid.quantityWanted,
            _incomingBid.currency,
            _incomingBid.pricePerToken,
            _incomingBid.pricePerToken * _incomingBid.quantityWanted
        );
    }

    /*///////////////////////////////////////////////////////////////
                    Auction lisitngs sales logic
    //////////////////////////////////////////////////////////////*/

    /// @dev Checks whether an incoming bid is the new current highest bid.
    function isNewWinningBid(
        uint256 _reserveAmount,
        uint256 _currentWinningBidAmount,
        uint256 _incomingBidAmount
    ) internal view returns (bool isValidNewBid) {
        if (_currentWinningBidAmount == 0) {
            isValidNewBid = _incomingBidAmount >= _reserveAmount;
        } else {
            isValidNewBid = (_incomingBidAmount > _currentWinningBidAmount &&
                ((_incomingBidAmount - _currentWinningBidAmount) * MAX_BPS) / _currentWinningBidAmount >= s.bidBufferBps);
        }
    }

    function closeAuction(uint256 _listingId, address _closeFor) external onlyExistingListing(_listingId) {
        Listing memory targetListing = s.listings[_listingId];

        require(targetListing.listingType == ListingType.Auction, "not an auction.");

        Bid memory targetBid = s.winningBid[_listingId];

        // Cancel auction if (1) auction hasn't started, or (2) auction doesn't have any bids.
        bool toCancel = targetListing.startTime > block.timestamp || targetBid.bidder == address(0);

        if (toCancel) {
            // cancel auction listing owner check
            _cancelAuction(targetListing);
        } else {
            require(targetListing.endTime < block.timestamp, "cannot close auction before it has ended.");

            // No `else if` to let auction close in 1 tx when targetListing.tokenOwner == targetBid.offeror.
            if (_closeFor == targetListing.tokenOwner) {
                _closeAuctionForAuctionCreator(targetListing, targetBid);
            }

            if (_closeFor == targetBid.bidder) {
                _closeAuctionForBidder(targetListing, targetBid);
            }
        }
    }

        /// @dev Cancels an auction.
    function _cancelAuction(Listing memory _targetListing) internal {
        require(s.listings[_targetListing.listingId].tokenOwner == LibMeta.msgSender(), "caller is not the listing creator.");

        delete s.listings[_targetListing.listingId];

        transferListingTokens(address(this), _targetListing.tokenOwner, _targetListing.quantity, _targetListing);

        emit AuctionClosed(_targetListing.listingId, LibMeta.msgSender(), true, _targetListing.tokenOwner, address(0));
    }

    /// @dev Closes an auction for an auction creator; distributes winning bid amount to auction creator.
    function _closeAuctionForAuctionCreator(Listing memory _targetListing, Bid memory _winningBid) internal {
        uint256 payoutAmount = _winningBid.pricePerToken * _targetListing.quantity;

        _targetListing.quantity = 0;
        _targetListing.endTime = block.timestamp;
        s.listings[_targetListing.listingId] = _targetListing;

        _winningBid.pricePerToken = 0;
        s.winningBid[_targetListing.listingId] = _winningBid;

        payout(address(this), _targetListing.tokenOwner, _targetListing.currency, payoutAmount, _targetListing);

        emit AuctionClosed(
            _targetListing.listingId,
            LibMeta.msgSender(),
            false,
            _targetListing.tokenOwner,
            _winningBid.bidder
        );
    }

    function getWinningBid(uint256 _listingId)
        external
        view
        onlyExistingListing(_listingId)
        returns (
            address _bidder,
            address _currency,
            uint256 _bidAmount
        )
    {
        Listing memory _targetListing = s.listings[_listingId];
        Bid memory _currentWinningBid = s.winningBid[_listingId];

        _bidder = _currentWinningBid.bidder;
        _currency = _targetListing.currency;
        _bidAmount = _currentWinningBid.totalPrice;
    }

    /// @dev Closes an auction for the winning bidder; distributes auction items to the winning bidder.
    function _closeAuctionForBidder(Listing memory _targetListing, Bid memory _winningBid) internal {
        uint256 quantityToSend = _winningBid.quantityWanted;

        _targetListing.endTime = block.timestamp;
        _winningBid.quantityWanted = 0;

        s.winningBid[_targetListing.listingId] = _winningBid;
        s.listings[_targetListing.listingId] = _targetListing;

        transferListingTokens(address(this), _winningBid.bidder, quantityToSend, _targetListing);

        emit AuctionClosed(
            _targetListing.listingId,
            LibMeta.msgSender(),
            false,
            _targetListing.tokenOwner,
            _winningBid.bidder
        );
    }

    /*///////////////////////////////////////////////////////////////
                            Getter functions
    //////////////////////////////////////////////////////////////*/
    function getPlatformFeeInfo() external view returns (address, uint16) {
        return (s.platformFeeRecipient, uint16(s.platformFeeBps));
    }

    /*///////////////////////////////////////////////////////////////
                            Setter functions
    //////////////////////////////////////////////////////////////*/
    /// @dev Lets a contract admin update platform fee recipient and bps.
    // TODO: add DEFAULT_ADMIN_ROLE check
    // need to write an AccessControl facet
    function setPlatformFeeInfo(
        address _platformFeeRecipient,
        uint256 _platformFeeBps
    ) external onlyOwner {
        require(_platformFeeBps <= MAX_BPS, "bps <= 10000.");

        s.platformFeeBps = uint64(_platformFeeBps);
        s.platformFeeRecipient = _platformFeeRecipient;

        emit PlatformFeeInfoUpdated(_platformFeeRecipient, _platformFeeBps);
    }

    /// @dev Lets a contract admin set auction buffers.
    function setAuctionBuffers(uint256 _timeBuffer, uint256 _bidBufferBps) external onlyOwner {
        require(_bidBufferBps < MAX_BPS, "invalid BPS.");

        s.timeBuffer = uint64(_timeBuffer);
        s.bidBufferBps = uint64(_bidBufferBps);

        emit AuctionBuffersUpdated(_timeBuffer, _bidBufferBps);
    }

    /*///////////////////////////////////////////////////////////////
            Shared (direct+auction listings) internal functions
    //////////////////////////////////////////////////////////////*/
    function transferListingTokens(
        address _from,
        address _to,
        uint256 _quantity,
        Listing memory _listing
    ) internal {
        if (_listing.tokenType == TokenType.ERC1155) {
            IERC1155Upgradeable(_listing.assetContract).safeTransferFrom(_from, _to, _listing.tokenId, _quantity, "");
        } else if (_listing.tokenType == TokenType.ERC721) {
            IERC721Upgradeable(_listing.assetContract).safeTransferFrom(_from, _to, _listing.tokenId, "");
        }
    }

    /// @dev Pays out stakeholders in a sale.
    function payout(
        address _payer,
        address _payee,
        address _currencyToUse,
        uint256 _totalPayoutAmount,
        Listing memory _listing
    ) internal {
        uint256 platformFeeCut = (_totalPayoutAmount * s.platformFeeBps) / MAX_BPS;
        address _nativeTokenWrapper = s.nativeTokenWrapper;

        uint256 royaltyCut = LibRoyalty.distributeRoyalty(
            _listing.royaltyInfoId,
            _payer,
            _totalPayoutAmount,
            _currencyToUse,
            _nativeTokenWrapper
        );

        // TODO: If royaltyCut is 0, then royalty is not set offchain
        // use below to use onchain royalty
        // --------------------------------
        // uint256 royaltyCut;
        // address royaltyRecipient;
        // Distribute royalties. See Sushiswap's https://github.com/sushiswap/shoyu/blob/master/contracts/base/BaseExchange.sol#L296
        // try IERC2981Upgradeable(_listing.assetContract).royaltyInfo(_listing.tokenId, _totalPayoutAmount) returns (
        //     address royaltyFeeRecipient,
        //     uint256 royaltyFeeAmount
        // ) {
        //     if (royaltyFeeRecipient != address(0) && royaltyFeeAmount > 0) {
        //         require(royaltyFeeAmount + platformFeeCut <= _totalPayoutAmount, "fees exceed the price");
        //         royaltyRecipient = royaltyFeeRecipient;
        //         royaltyCut = royaltyFeeAmount;
        //     }
        //     CurrencyTransferLib.transferCurrencyWithWrapper(
        //         _currencyToUse,
        //         _payer,
        //         royaltyRecipient,
        //         royaltyCut,
        //         address(0)
        //     );
        // } catch {}

        LibCurrencyTransfer.transferCurrencyWithWrapper(
            _currencyToUse,
            _payer,
            s.platformFeeRecipient,
            platformFeeCut,
            _nativeTokenWrapper
        );
        LibCurrencyTransfer.transferCurrencyWithWrapper(
            _currencyToUse,
            _payer,
            _payee,
            _totalPayoutAmount - (platformFeeCut + royaltyCut),
            _nativeTokenWrapper
        );
    }

    /// @dev Validates conditions of a direct listing sale.
    function validateDirectListingSale(
        Listing memory _listing,
        address _payer,
        uint256 _quantityToBuy,
        address _currency,
        uint256 settledTotalPrice
    ) internal {
        require(_listing.listingType == ListingType.Direct, "cannot buy from listing.");

        // Check whether a valid quantity of listed tokens is being bought.
        require(
            _listing.quantity > 0 && _quantityToBuy > 0 && _quantityToBuy <= _listing.quantity,
            "invalid amount of tokens."
        );

        // Check if sale is made within the listing window.
        require(block.timestamp < _listing.endTime && block.timestamp > _listing.startTime, "not within sale window.");

        // Check: buyer owns and has approved sufficient currency for sale.
        if (_currency == LibCurrencyTransfer.NATIVE_TOKEN) {
            require(msg.value == settledTotalPrice, "msg.value != price");
        } else {
            LibToken.validateERC20BalAndAllowance(_payer, _currency, settledTotalPrice);
        }

        // Check whether token owner owns and has approved `quantityToBuy` amount of listing tokens from the listing.
        LibToken.validateOwnershipAndApproval(
            _listing.tokenOwner,
            _listing.assetContract,
            _listing.tokenId,
            _quantityToBuy,
            _listing.tokenType
        );
    }

    function setNativeTokenWrapper(address _nativeTokenWrapper) external onlyOwner {
        s.nativeTokenWrapper = _nativeTokenWrapper;
    }

    function getNativeTokenWrapper() external view returns (address) {
        return s.nativeTokenWrapper;
    }
}
