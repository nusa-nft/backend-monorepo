// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

interface INusaRoyaltyDistributor {

  event RoyaltyPaid(
    uint256 indexed listingId,
    address[] recipients,
    uint64[] bpsPerRecipients,
    uint256 totalPayout
  );

  struct RoyaltyInfo {
    uint256 id;
    address[] recipients;
    uint64[] bpsPerRecipients;
  }

  struct RoyaltyParams {
      address[] recipients;
      uint64[] bpsPerRecipients;
  }

  function setMarketplace(address marketplace) external;

  function setRoyaltyInfo(
    address[] calldata recipients,
    uint64[] calldata bpsPerRecipients
  )  external returns(uint256);

  function updateRoyaltyInfo(
    uint256 id,
    address[] calldata recipients,
    uint64[] calldata bpsPerRecipients
  ) external returns(uint256);

  function getTotalRoyaltyAmount(uint256 id, uint256 totalPayoutAmount, uint64 MAX_BPS) external view returns (uint256);

  function distributeRoyalty(uint256 id, address payer, uint256 totalPayoutAmount, address _currency, address nativeTokenWrapper, uint64 MAX_BPS) external payable;

  function getRoyaltyInfo(uint256 id) external view returns (RoyaltyInfo memory);
}