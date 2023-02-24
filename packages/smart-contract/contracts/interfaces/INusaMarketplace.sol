// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import "./IPlatformFee.sol";
import {Listing, ListingParams} from "../libraries/LibAppStorage.sol";

interface INusaMarketplace is IPlatformFee {
    /// @dev Emitted when a new listing is created.
    event ListingAdded(
        uint256 indexed listingId,
        address indexed assetContract,
        address indexed lister,
        Listing listing
    );

    /// @dev Emitted when the parameters of a listing are updated.
    event ListingUpdated(uint256 indexed listingId, address indexed listingCreator);

    /// @dev Emitted when a listing is cancelled.
    event ListingRemoved(uint256 indexed listingId, address indexed listingCreator);

    /**
     * @dev Emitted when a buyer buys from a direct listing, or a lister accepts some
     *      buyer's offer to their direct listing.
     */
    event NewSale(
        uint256 indexed listingId,
        address indexed assetContract,
        address indexed lister,
        address buyer,
        uint256 quantityBought,
        uint256 totalPricePaid
    );


    /// @dev Emitted when (1) a new offer is made to a direct listing, or (2) when a new bid is made in an auction.
    event NewBid(
        uint256 indexed listingId,
        address bidder,
        uint256 quantityWanted,
        address currency,
        uint256 pricePerToken,
        uint256 totalPrice
    );

    /// @dev Emitted when an auction is closed.
    event AuctionClosed(
        uint256 indexed listingId,
        address indexed closer,
        bool indexed cancelled,
        address auctionCreator,
        address winningBidder
    );

    /// @dev Emitted when auction buffers are updated.
    event AuctionBuffersUpdated(uint256 timeBuffer, uint256 bidBufferBps);

    /**
     *  @notice Lets a token owner list tokens (ERC 721 or ERC 1155) for sale in a direct listing, or an auction.
     *
     *  @dev NFTs to list for sale in an auction are escrowed in Marketplace. For direct listings, the contract
     *       only checks whether the listing's creator owns and has approved Marketplace to transfer the NFTs to list.
     *
     *  @param _params The parameters that govern the listing to be created.
     */
    function createListing(ListingParams memory _params) external;

    /**
     *  @notice Lets a listing's creator edit the listing's parameters. A direct listing can be edited whenever.
     *          An auction listing cannot be edited after the auction has started.
     *
     *  @param _listingId            The uid of the lisitng to edit.
     *  @param _params The parameters that govern the listing to be created.
     */
    function updateListing(
        uint256 _listingId,
        ListingParams memory _params
    ) external;

    /**
     *  @notice Lets a direct listing creator cancel their listing.
     *
     *  @param _listingId The unique Id of the lisitng to cancel.
     */
    function cancelListing(uint256 _listingId) external;

    /**
     *  @notice Lets someone buy a given quantity of tokens from a direct listing by paying the fixed price.
     *
     *  @param _listingId The uid of the direct lisitng to buy from.
     *  @param _buyFor The receiver of the NFT being bought.
     *  @param _quantity The amount of NFTs to buy from the direct listing.
     *  @param _currency The currency to pay the price in.
     *  @param _totalPrice The total price to pay for the tokens being bought.
     *
     *  @dev A sale will fail to execute if either:
     *          (1) buyer does not own or has not approved Marketplace to transfer the appropriate
     *              amount of currency (or hasn't sent the appropriate amount of native tokens)
     *
     *          (2) the lister does not own or has removed Markeplace's
     *              approval to transfer the tokens listed for sale.
     */
    function buy(
        uint256 _listingId,
        address _buyFor,
        uint256 _quantity,
        address _currency,
        uint256 _totalPrice
    ) external payable;

    /**
     *  @notice Lets someone make an offer to a direct listing, or bid in an auction.
     *
     *  @dev Each (address, listing ID) pair maps to a single unique offer. So e.g. if a buyer makes
     *       makes two offers to the same direct listing, the last offer is counted as the buyer's
     *       offer to that listing.
     *
     *  @param _listingId        The unique ID of the lisitng to make an offer/bid to.
     *
     *  @param _quantityWanted   For auction listings: the 'quantity wanted' is the total amount of NFTs
     *                           being auctioned, regardless of the value of `_quantityWanted` passed.
     *                           For direct listings: `_quantityWanted` is the quantity of NFTs from the
     *                           listing, for which the offer is being made.
     *
     *  @param _currency         For auction listings: the 'currency of the bid' is the currency accepted
     *                           by the auction, regardless of the value of `_currency` passed. For direct
     *                           listings: this is the currency in which the offer is made.
     *
     *  @param _pricePerToken    For direct listings: offered price per token. For auction listings: the bid
     *                           amount per token. The total offer/bid amount is `_quantityWanted * _pricePerToken`.
     *
     */
    function bid(
        uint256 _listingId,
        uint256 _quantityWanted,
        address _currency,
        uint256 _pricePerToken
    ) external payable;

    /**
     *  @notice Lets any account close an auction on behalf of either the (1) auction's creator, or (2) winning bidder.
     *              For (1): The auction creator is sent the the winning bid amount.
     *              For (2): The winning bidder is sent the auctioned NFTs.
     *
     *  @param _listingId The uid of the listing (the auction to close).
     *  @param _closeFor For whom the auction is being closed - the auction creator or winning bidder.
     */
    function closeAuction(uint256 _listingId, address _closeFor) external;

    // function getNativeTokenWrapper() external view returns (address);

    // function getMaxBps() external view returns (uint64);
}