// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ERC1155_dummy is ERC1155URIStorage, Ownable {
    uint256 internal nextTokenId_;

    constructor() ERC1155("") {}

    /// @notice The tokenId assigned to the next new NFT to be minted.
    function nextTokenIdToMint() public view virtual returns (uint256) {
        return nextTokenId_;
    }

    function setURI(uint256 id, string memory newuri) public onlyOwner {
        _setURI(id, newuri);
    }

    function mint(address account, uint256 id, string calldata tokenURI, uint256 amount, bytes memory data)
        public
        onlyOwner
    {
        uint256 tokenIdToMint;
        uint256 nextIdToMint = nextTokenIdToMint();

        if (id == type(uint256).max) {
            tokenIdToMint = nextIdToMint;
            nextTokenId_ += 1;
            _setURI(nextIdToMint, tokenURI);
        } else {
            require(id < nextIdToMint, "invalid id");
            tokenIdToMint = id;
        }

        _mint(account, tokenIdToMint, amount, data);
    }

    function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, string[] memory _uris, bytes memory data)
        public
        onlyOwner
    {
        uint256 nextIdToMint = nextTokenIdToMint();

        for (uint256 i = 0; i < ids.length; i += 1) {
            if (ids[i] == type(uint256).max) {
                ids[i] = nextIdToMint;
                _setURI(nextIdToMint, _uris[i]);
                nextIdToMint += 1;
            } else {
                require(ids[i] < nextIdToMint, "invalid id");
            }
        }

        nextTokenId_ = nextIdToMint;

        _mintBatch(to, ids, amounts, data);
    }
}
