// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./LibDiamond.sol";
import "./LibMeta.sol";

uint64 constant MAX_BPS = 10_000;

enum TokenType {
    ERC1155,
    ERC721
}

enum ListingType {
    Direct,
    Auction,
    NoListing
}

enum OfferStatus {
    UNSET,
    CREATED,
    COMPLETED,
    CANCELLED
}

enum ListingStatus {
    UNSET,
    CREATED,
    COMPLETED,
    CANCELLED
}

struct RoyaltyParams {
    address[] recipients;
    uint64[] bpsPerRecipients;
}

struct Royalty {
    uint256 id;
    address[] recipients;
    uint64[] bpsPerRecipients;
    bool isPaid;
}

struct Listing {
    uint256 listingId;
    address tokenOwner;
    address assetContract;
    uint256 tokenId;
    uint256 startTime;
    uint256 endTime;
    uint256 quantity;
    address currency;
    uint256 reservePricePerToken;
    uint256 buyoutPricePerToken;
    TokenType tokenType;
    ListingType listingType;
    ListingStatus status;
    uint256 royaltyInfoId; // Refer to NusaRoyaltyDistributor Contract
}

struct ListingParams {
    address assetContract;
    uint256 tokenId;
    uint256 startTime;
    uint256 secondsUntilEndTime;
    uint256 quantityToList;
    address currencyToAccept;
    uint256 reservePricePerToken;
    uint256 buyoutPricePerToken;
    ListingType listingType;
    RoyaltyParams royaltyParams;
}

struct Bid {
    uint256 listingId;
    address bidder;
    uint256 quantityWanted;
    address currency;
    uint256 pricePerToken;
    uint256 totalPrice;
}

struct OfferParams {
    address assetContract;
    uint256 tokenId;
    uint256 quantity;
    address currency;
    uint256 totalPrice;
    uint256 expirationTimestamp;
    RoyaltyParams royaltyParams;
}

struct Offer {
    uint256 offerId;
    address offeror;
    address assetContract;
    uint256 tokenId;
    uint256 quantity;
    address currency;
    uint256 totalPrice;
    uint256 expirationTimestamp;
    TokenType tokenType;
    OfferStatus status;
    uint256 royaltyInfoId; // Refer to NusaRoyaltyDistributor Contract
}

struct AppStorage {
    /// Platform Settings
    /// -----------------
    /// @dev The address that receives all platform fees from all sales.
    address platformFeeRecipient;
    /// @dev The % of primary sales collected as platform fees.
    uint64 platformFeeBps;
    address nativeTokenWrapper;

    /// Auction Settings
    /// ----------------
    /**
     *  @dev The amount of time added to an auction's 'endTime', if a bid is made within `timeBuffer`
     *       seconds of the existing `endTime`. Default: 15 minutes.
     */
    uint64 timeBuffer;
    /// @dev The minimum % increase required from the previous winning bid. Default: 5%.
    uint64 bidBufferBps;

    /// Listings
    /// --------
    uint256 totalListings;
    // listingId => Listing
    mapping(uint256 => Listing) listings;
    // listingId => Bid
    mapping(uint256 => Bid) winningBid;

    /// Offers
    /// ------
    uint256 totalOffers;
    // id => Offer
    mapping(uint256 => Offer) offers;

    /// Royalty
    /// -------
    // id => Royalty
    mapping(uint256 => Royalty) royalties;
    uint256 totalRoyalties;
}

library LibAppStorage {
    function diamondStorage() internal pure returns (AppStorage storage ds) {
        assembly {
            ds.slot := 0
        }
    }

    function abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }
}

contract Modifiers {
    AppStorage internal s;

    modifier onlyOwner() {
        LibDiamond.enforceIsContractOwner();
        _;
    }

    /// @dev Checks whether a listing exists.
    modifier onlyExistingListing(uint256 _listingId) {
        require(s.listings[_listingId].assetContract != address(0), "DNE");
        _;
    }

    modifier onlyListingCreator(uint256 _listingId) {
        require(s.listings[_listingId].tokenOwner == LibMeta.msgSender(), "only listing creator");
        _;
    }

    modifier onlyOfferCreator(uint256 _offerId) {
        require(s.offers[_offerId].offeror == LibMeta.msgSender(), "only offeror");
        _;
    }

    modifier onlyExistingOffer(uint256 _offerId) {
        require(s.offers[_offerId].status == OfferStatus.CREATED, "Marketplace: invalid offer.");
        _;
    }
}