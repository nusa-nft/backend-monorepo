// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {Modifiers, RoyaltyParams, Offer, OfferStatus} from "../libraries/LibAppStorage.sol";
import "../interfaces/INusaOffers.sol";
import "../libraries/LibMeta.sol";
import "../libraries/LibToken.sol";
import "../libraries/LibRoyalty.sol";
import "../libraries/LibCurrencyTransfer.sol";

contract OffersFacet is INusaOffers, Modifiers {
    function offer(
        OfferParams memory _params
    ) external {
        uint256 _offerId = s.totalOffers;
        s.totalOffers += 1;

        address _offeror = LibMeta.msgSender();
        TokenType _tokenType = LibToken.getTokenType(_params.assetContract);

        _validateNewOffer(_params, _tokenType);

        uint256 royaltyInfoId = LibRoyalty.addRoyaltyInfo(
            _params.royaltyParams.recipients,
            _params.royaltyParams.bpsPerRecipients
        );

        Offer memory _offer = Offer({
            offerId: _offerId,
            offeror: _offeror,
            assetContract: _params.assetContract,
            tokenId: _params.tokenId,
            tokenType: _tokenType,
            quantity: _params.quantity,
            currency: _params.currency,
            totalPrice: _params.totalPrice,
            expirationTimestamp: _params.expirationTimestamp,
            status: OfferStatus.CREATED,
            royaltyInfoId: royaltyInfoId
        });

        s.offers[_offerId] = _offer;

        emit NewOffer(_offeror, _offerId, _params.assetContract, _offer);
    }

    function acceptOffer(uint256 _offerId) external onlyExistingOffer(_offerId) {
        Offer memory _targetOffer = s.offers[_offerId];

        require(_targetOffer.expirationTimestamp > block.timestamp, "EXPIRED");

        LibToken.validateERC20BalAndAllowance(_targetOffer.offeror, _targetOffer.currency, _targetOffer.totalPrice);

        LibToken.validateOwnershipAndApproval(
            LibMeta.msgSender(),
            _targetOffer.assetContract,
            _targetOffer.tokenId,
            _targetOffer.quantity,
            _targetOffer.tokenType
        );

        s.offers[_offerId].status = OfferStatus.COMPLETED;

        _payout(_targetOffer.offeror, LibMeta.msgSender(), _targetOffer.currency, _targetOffer.totalPrice, _targetOffer);
        _transferOfferTokens(LibMeta.msgSender(), _targetOffer.offeror, _targetOffer.quantity, _targetOffer);

        emit AcceptedOffer(
            _targetOffer.offeror,
            _targetOffer.offerId,
            _targetOffer.assetContract,
            _targetOffer.tokenId,
            LibMeta.msgSender(),
            _targetOffer.quantity,
            _targetOffer.totalPrice
        );
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return s.offers[offerId];
    }

    function cancelOffer(uint256 _offerId) external onlyExistingOffer(_offerId) onlyOfferCreator(_offerId) {
        s.offers[_offerId].status = OfferStatus.CANCELLED;
        emit CancelledOffer(LibMeta.msgSender(), _offerId);
    }


    /// @dev Checks whether the auction creator owns and has approved marketplace to transfer auctioned tokens.
    function _validateNewOffer(OfferParams memory _params, TokenType _tokenType) internal view {
        require(_params.totalPrice > 0, "zero price.");
        require(_params.quantity > 0, "Marketplace: wanted zero tokens.");
        require(_params.quantity == 1 || _tokenType == TokenType.ERC1155, "Marketplace: wanted invalid quantity.");
        require(
            _params.expirationTimestamp + 60 minutes > block.timestamp,
            "Marketplace: invalid expiration timestamp."
        );
        LibToken.validateERC20BalAndAllowance(LibMeta.msgSender(), _params.currency, _params.totalPrice);
    }

    function _payout(
        address _payer,
        address _payee,
        address _currencyToUse,
        uint256 _totalPayoutAmount,
        Offer memory _offer
    ) internal {
        uint256 platformFeeCut = (_totalPayoutAmount * s.platformFeeBps) / MAX_BPS;


        uint256 royaltyCut = LibRoyalty.distributeRoyalty(
            _offer.royaltyInfoId,
            _payer,
            _totalPayoutAmount,
            _currencyToUse,
            _currencyToUse
        );

        // TODO: If royaltyCut is 0, then royalty is not set offchain
        // use below to use onchain royalty
        // --------------------------------
        // uint256 royaltyCut;
        // address royaltyRecipient;
        // Distribute royalties. See Sushiswap's https://github.com/sushiswap/shoyu/blob/master/contracts/base/BaseExchange.sol#L296
        // try IERC2981(_offer.assetContract).royaltyInfo(_offer.tokenId, _totalPayoutAmount) returns (
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
            address(0)
        );
        LibCurrencyTransfer.transferCurrencyWithWrapper(
            _currencyToUse,
            _payer,
            _payee,
            _totalPayoutAmount - (platformFeeCut + royaltyCut),
            address(0)
        );
    }

        /// @dev Transfers tokens.
    function _transferOfferTokens(
        address _from,
        address _to,
        uint256 _quantity,
        Offer memory _offer
    ) internal {
        if (_offer.tokenType == TokenType.ERC1155) {
            IERC1155(_offer.assetContract).safeTransferFrom(_from, _to, _offer.tokenId, _quantity, "");
        } else if (_offer.tokenType == TokenType.ERC721) {
            IERC721(_offer.assetContract).safeTransferFrom(_from, _to, _offer.tokenId, "");
        }
    }
}
