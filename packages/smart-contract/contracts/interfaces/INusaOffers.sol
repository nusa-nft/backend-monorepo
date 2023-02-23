// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

import { Offer, RoyaltyParams, OfferParams } from "../libraries/LibAppStorage.sol";

interface INusaOffers {
    /// @dev Emitted when a new offer is created.
    event NewOffer(address indexed offeror, uint256 indexed offerId, address indexed assetContract, Offer offer);

    /// @dev Emitted when an offer is cancelled.
    event CancelledOffer(address indexed offeror, uint256 indexed offerId);

    /// @dev Emitted when an offer is accepted.
    event AcceptedOffer(
        address indexed offeror,
        uint256 indexed offerId,
        address indexed assetContract,
        uint256 tokenId,
        address seller,
        uint256 quantityBought,
        uint256 totalPricePaid
    );

    function offer(OfferParams memory _params) external;

    function acceptOffer(uint256 _offerId) external;

    function getOffer(uint256 offerId) external view returns (Offer memory);

    function cancelOffer(uint256 offerId) external;
}
