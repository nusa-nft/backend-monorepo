// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "./LibCurrencyTransfer.sol";
import {LibAppStorage, AppStorage, Royalty, MAX_BPS} from "./LibAppStorage.sol";

library LibRoyalty {
    event RoyaltyPaid(
        uint256 indexed id,
        address[] recipients,
        uint64[] bpsPerRecipients,
        uint256 totalPayout,
        address currency
    );

    function addRoyaltyInfo(
        address[] memory _recipients,
        uint64[] memory _bpsPerRecipients
    ) internal returns (uint256) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        uint256 _id = s.totalRoyalties;
        s.royalties[_id] = Royalty({
            id: _id,
            recipients: _recipients,
            bpsPerRecipients: _bpsPerRecipients,
            isPaid: false
        });
        s.totalRoyalties += 1;

        return _id;
    }

    function updateRoyaltyInfo(
        uint256 _id,
        address[] memory _recipients,
        uint64[] memory _bpsPerRecipients
    ) internal returns (uint256) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        s.royalties[_id] = Royalty({
            id: _id,
            recipients: _recipients,
            bpsPerRecipients: _bpsPerRecipients,
            isPaid: false
        });

        return _id;
    }

    function distributeRoyalty(
        uint256 _id,
        address _payer,
        uint256 _totalPayoutAmount,
        address _currency,
        address _nativeTokenWrapper
    ) internal returns(uint256 totalRoyaltyCut) {
        AppStorage storage s = LibAppStorage.diamondStorage();
        Royalty memory listingRoyalty = s.royalties[_id];

        for (uint i = 0; i < listingRoyalty.recipients.length; i++) {
            uint256 value = (_totalPayoutAmount *
                listingRoyalty.bpsPerRecipients[i]) / MAX_BPS;
            LibCurrencyTransfer.transferCurrencyWithWrapper(
                _currency,
                _payer,
                listingRoyalty.recipients[i],
                value,
                _nativeTokenWrapper
            );
            totalRoyaltyCut += value;
        }

        emit RoyaltyPaid(
            _id,
            listingRoyalty.recipients,
            listingRoyalty.bpsPerRecipients,
            _totalPayoutAmount,
            _currency
        );
    }
}
