// SPDX-License-Identifier: MIT
pragma solidity ^0.8.11;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/ERC1155URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@thirdweb-dev/contracts/lib/TWStrings.sol";
import "./SignatureMintERC1155Upgradeable.sol";
import "./libraries/LibCurrencyTransfer.sol";

/**
 *  The `NusaNFT` smart contract implements the ERC1155 NFT standard.
 *  It includes the following additions to standard ERC1155 logic:
 *
 *      - Ability to mint NFTs via the provided `mintTo` and `batchMintTo` functions.
 *
 *      - Contract metadata for royalty support on platforms such as OpenSea that use
 *        off-chain information to distribute roaylties.
 *
 *      - Ownership of the contract, with the ability to restrict certain functions to
 *        only be called by the contract's owner.
 *
 *      - Multicall capability to perform multiple actions atomically
 *
 */
contract NusaNFT_V2_Test_Only is
    UUPSUpgradeable,
    ERC1155Upgradeable,
    ERC1155URIStorageUpgradeable,
    ERC2981Upgradeable,
    OwnableUpgradeable,
    AccessControlEnumerableUpgradeable,
    SignatureMintERC1155Upgradeable
{
    using TWStrings for uint256;

    string public name;
    string public symbol;

    /*//////////////////////////////////////////////////////////////
                        State variables
    //////////////////////////////////////////////////////////////*/

    /// @dev The tokenId of the next NFT to mint.
    uint256 internal nextTokenId_;

    /*//////////////////////////////////////////////////////////////
                        Mappings
    //////////////////////////////////////////////////////////////*/

    /**
     *  @notice Returns the total supply of NFTs of a given tokenId
     *  @dev Mapping from tokenId => total circulating supply of NFTs of that tokenId.
     */
    mapping(uint256 => uint256) public totalSupply;

    mapping(uint256 => address) private _creators;
    mapping(bytes32 => bool) private _isUsed;
    mapping(uint256 => bytes32) public _rootHashVoucher;

     /// @dev Only lister role holders can create listings, when listings are restricted by lister address.
    bytes32 public constant ADMIN_MINTER_ROLE = keccak256("ADMIN_MINTER_ROLE");


    /*//////////////////////////////////////////////////////////////
                            Events
    //////////////////////////////////////////////////////////////*/
    event TokenCreated (
        uint256 indexed tokenId
    );


    /*//////////////////////////////////////////////////////////////
                            Modifier
    //////////////////////////////////////////////////////////////*/
    
    /**
    * @dev Require msg.sender to be the creator of the token id
    */
    modifier onlyCreator(uint256 _tokenId) {
        require(_creators[_tokenId] == msg.sender, "NusaNFT#creatorOnly: ONLY_CREATOR_ALLOWED");
        _;
    }

    modifier onlyMintersOrOwner() {
        require(
            hasRole(ADMIN_MINTER_ROLE, msg.sender) || msg.sender == owner(),
            "NusaNFT:mintersOrOwnerOnly: ONLY_MINTERS_OR_OWNER_ALLOWED"
        );
        _;
    }


    /*//////////////////////////////////////////////////////////////
                            Constructor
    //////////////////////////////////////////////////////////////*/

    function initialize(
        string memory _name,
        string memory _symbol
    ) external initializer {
        name = _name;
        symbol = _symbol;
        __Ownable_init_unchained();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function reinitialize(
        string memory _name,
        string memory _symbol,
        uint8 version
    ) external onlyOwner reinitializer(version) {
        name = _name;
        symbol = _symbol;
        __Ownable_init_unchained();
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address) internal override view {
        require(msg.sender == owner() || hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    }

    function _canSetRoyaltyInfo() internal view returns (bool) {
        return (msg.sender == owner() || hasRole(DEFAULT_ADMIN_ROLE, msg.sender));
    }

    /*//////////////////////////////////////////////////////////////
                    Overriden metadata logic
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns the metadata URI for the given tokenId.
    function uri(uint256 _tokenId) public view virtual override(ERC1155Upgradeable, ERC1155URIStorageUpgradeable) returns (string memory) {
        return ERC1155URIStorageUpgradeable.uri(_tokenId);
    }

    function creator(uint256 _tokenId) public view returns(address){
        return _creators[_tokenId];
    }

    /*//////////////////////////////////////////////////////////////
                        Mint / burn logic
    //////////////////////////////////////////////////////////////*/

    function create(address _to, string memory _tokenURI) public onlyMintersOrOwner  {
        uint256 currentTokenId;
        uint256 nextTokenId = nextTokenIdToMint();
        currentTokenId = nextTokenId;
        nextTokenId_ += 1;
        _creators[nextTokenId] = _to;
        _setURI(currentTokenId, _tokenURI);

        emit TokenCreated(currentTokenId);
    }

    /**
     *  @notice          Lets an authorized address mint NFTs to a recipient.
     *  @dev             - The logic in the `_canMint` function determines whether the caller is authorized to mint NFTs.
     *                   - If `_tokenId == type(uint256).max` a new NFT at tokenId `nextTokenIdToMint` is minted. If the given
     *                     `tokenId < nextTokenIdToMint`, then additional supply of an existing NFT is being minted.
     *
     *  @param _to       The recipient of the NFTs to mint.
     *  @param _tokenId  The tokenId of the NFT to mint.
     *  @param _tokenURI The full metadata URI for the NFTs minted (if a new NFT is being minted).
     *  @param _amount   The amount of the same NFT to mint.
     */
    function mintTo(
        address _to,
        uint256 _tokenId,
        string memory _tokenURI,
        uint256 _amount
    ) public virtual {
        require(_canMint(), "Not authorized to mint.");

        uint256 tokenIdToMint;
        uint256 nextIdToMint = nextTokenIdToMint();

        if (_tokenId == type(uint256).max) {
            tokenIdToMint = nextIdToMint;
            nextTokenId_ += 1;
            _creators[nextIdToMint] = msg.sender;
            _setURI(nextIdToMint, _tokenURI);
        } else {
            require(_tokenId < nextIdToMint, "invalid id");
            tokenIdToMint = _tokenId;
        }

        _mint(_to, tokenIdToMint, _amount, "");
    }

    function batchMintTo(
        address _to,
        uint256[] memory _tokenIds,
        uint256[] memory _amounts,
        string[] memory _uris
    ) public virtual {
        require(_canMint(), "Not authorized to mint.");
        require(_amounts.length > 0, "Minting zero tokens.");
        require(_tokenIds.length == _amounts.length, "Length mismatch.");

        uint256 nextIdToMint = nextTokenIdToMint();
        // uint256 startNextIdToMint = nextIdToMint;

        uint256 numOfNewNFTs;

        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            if (_tokenIds[i] == type(uint256).max) {
                _tokenIds[i] = nextIdToMint;
                _creators[nextIdToMint] = msg.sender;
                _setURI(nextIdToMint, _uris[i]);
                nextIdToMint += 1;
                numOfNewNFTs += 1;
            } else {
                require(_tokenIds[i] < nextIdToMint, "invalid id");
            }
        }

        nextTokenId_ = nextIdToMint;
        _mintBatch(_to, _tokenIds, _amounts, "");
    }

    /**
     *  @notice         Lets an owner or approved operator burn NFTs of the given tokenId.
     *
     *  @param _owner   The owner of the NFT to burn.
     *  @param _tokenId The tokenId of the NFT to burn.
     *  @param _amount  The amount of the NFT to burn.
     */
    function burn(
        address _owner,
        uint256 _tokenId,
        uint256 _amount
    ) external virtual {
        address caller = msg.sender;

        require(caller == _owner || isApprovedForAll(_owner, caller), "Unapproved caller");
        require(balanceOf(_owner, _tokenId) >= _amount, "Not enough tokens owned");

        _burn(_owner, _tokenId, _amount);
    }

    /**
     *  @notice         Lets an owner or approved operator burn NFTs of the given tokenIds.
     *
     *  @param _owner    The owner of the NFTs to burn.
     *  @param _tokenIds The tokenIds of the NFTs to burn.
     *  @param _amounts  The amounts of the NFTs to burn.
     */
    function burnBatch(
        address _owner,
        uint256[] memory _tokenIds,
        uint256[] memory _amounts
    ) external virtual {
        address caller = msg.sender;

        require(caller == _owner || isApprovedForAll(_owner, caller), "Unapproved caller");
        require(_tokenIds.length == _amounts.length, "Length mismatch");

        for (uint256 i = 0; i < _tokenIds.length; i += 1) {
            require(balanceOf(_owner, _tokenIds[i]) >= _amounts[i], "Not enough tokens owned");
        }

        _burnBatch(_owner, _tokenIds, _amounts);
    }

    /*//////////////////////////////////////////////////////////////
                            ERC165 Logic
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns whether this contract supports the given interface.
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Upgradeable, AccessControlEnumerableUpgradeable, ERC2981Upgradeable) returns (bool) {
        return
            interfaceId == 0xd9b67a26 || // ERC165 Interface ID for ERC1155
            interfaceId == 0x0e89341c || // ERC165 Interface ID for ERC1155MetadataURI
            interfaceId == type(IERC2981Upgradeable).interfaceId; // ERC165 ID for ERC2981
    }

    /*//////////////////////////////////////////////////////////////
                            View functions
    //////////////////////////////////////////////////////////////*/

    /// @notice The tokenId assigned to the next new NFT to be minted.
    function nextTokenIdToMint() public view virtual returns (uint256) {
        return nextTokenId_;
    }

    /*//////////////////////////////////////////////////////////////
                    Internal (overrideable) functions
    //////////////////////////////////////////////////////////////*/

    /// @dev Returns whether a token can be minted in the given execution context.
    function _canMint() internal view virtual returns (bool) {
        return true;
        // return msg.sender == owner();
    }

    /// @dev Returns whether owner can be set in the given execution context.
    function _canSetOwner() internal view virtual returns (bool) {
        return msg.sender == owner();
    }

    /// @dev Runs before every token transfer / mint / burn.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        if (from == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                totalSupply[ids[i]] += amounts[i];
            }
        }

        if (to == address(0)) {
            for (uint256 i = 0; i < ids.length; ++i) {
                totalSupply[ids[i]] -= amounts[i];
            }
        }
    }

    /*//////////////////////////////////////////////////////////////
                        Signature minting logic
    //////////////////////////////////////////////////////////////*/

    /**
     *  @notice           Mints tokens according to the provided mint request.
     *
     *  @param _req       The payload / mint request.
     *  @param _signature The signature produced by an account signing the mint request.
     */
    function mintWithSignature(MintRequest calldata _req, bytes calldata _signature)
        external
        payable
        virtual
        override
        returns (address signer)
    {
        require(_req.quantity > 0, "Minting zero tokens.");

        uint256 tokenIdToMint;
        uint256 nextIdToMint = nextTokenIdToMint();

        if (_req.tokenId == type(uint256).max) {
            tokenIdToMint = nextIdToMint;
            _creators[tokenIdToMint] = _req.to;
            nextTokenId_ += 1;
        } else {
            require(_req.tokenId < nextIdToMint, "invalid id");
            tokenIdToMint = _req.tokenId;
        }

        // Verify and process payload.
        signer = _processRequest(_req, _signature);

        address receiver = _req.to;

        // Collect price
        _collectPriceOnClaim(_req.primarySaleRecipient, _req.quantity, _req.currency, _req.pricePerToken);

        // Set royalties, if applicable.
        if (_req.royaltyRecipient != address(0)) {
            _setTokenRoyalty(tokenIdToMint, _req.royaltyRecipient, uint96(_req.royaltyBps));
        }

        // Set URI
        if (_req.tokenId == type(uint256).max) {
            _setURI(tokenIdToMint, _req.uri);
        }

        // Mint tokens.
        _mint(receiver, tokenIdToMint, _req.quantity, "");

        emit TokensMintedWithSignature(signer, receiver, tokenIdToMint, _req);
    }

    /*//////////////////////////////////////////////////////////////
                            Internal functions
    //////////////////////////////////////////////////////////////*/

    /// @dev Returns whether a given address is authorized to sign mint requests.
    function _canSignMintRequest(address _signer) internal view virtual returns (bool) {
        return _signer == owner();
    }

    function _isAuthorizedSigner(address _signer) internal view virtual override returns (bool) {
        return _signer == owner();
    }

    /// @dev Returns whether primary sale recipient can be set in the given execution context.
    // function _canSetPrimarySaleRecipient() internal view virtual override returns (bool) {
    //     return msg.sender == owner();
    // }

    /// @dev Collects and distributes the primary sale value of NFTs being claimed.
    function _collectPriceOnClaim(
        address _primarySaleRecipient,
        uint256 _quantityToClaim,
        address _currency,
        uint256 _pricePerToken
    ) internal virtual {
        if (_pricePerToken == 0) {
            return;
        }

        uint256 totalPrice = _quantityToClaim * _pricePerToken;

        if (_currency == LibCurrencyTransfer.NATIVE_TOKEN) {
            require(msg.value == totalPrice, "Must send total price.");
        }

        // address saleRecipient = _primarySaleRecipient == address(0) ? primarySaleRecipient() : _primarySaleRecipient;
        address saleRecipient = _primarySaleRecipient;
        LibCurrencyTransfer.transferCurrency(_currency, msg.sender, saleRecipient, totalPrice);
    }

     /*//////////////////////////////////////////////////////////////
                    Voucher
    //////////////////////////////////////////////////////////////*/


    function claimVoucher(
        string calldata voucher,
        uint256 _tokenId,
        address _to,
        bytes32[] calldata merkleProof
    ) public onlyMintersOrOwner {
        require(_verifyVoucher(voucher, _tokenId, merkleProof), "Voucher not valid");
        mintTo(_to,
            _tokenId, "", 1);
        bytes32 hashVoucher = keccak256(abi.encodePacked(voucher));
        _isUsed[hashVoucher] = true;
    }

    function registerVoucher(uint256 _tokenId, bytes32 rootHash ) public onlyMintersOrOwner {
        // require(_creators[_tokenId] == msg.sender || owner() == msg.sender, "Only creator and ");
        _rootHashVoucher[_tokenId] = rootHash;
    }

    function isValidVoucher(string memory voucher, uint256 _tokenId, bytes32[] calldata proof) public view returns(bool){
        return _verifyVoucher(voucher, _tokenId, proof);
    }

    function getTimestamp() public view returns(uint){
        return block.timestamp;
    }

    /*//////////////////////////////////////////////////////////////
                    Voucher Internal Function
    //////////////////////////////////////////////////////////////*/

    function _verifyVoucher(string memory voucher, uint256 _tokenId, bytes32[] calldata proof) internal view returns(bool){
        if(_creators[_tokenId] == address(0x0)) return false;
        bytes32 computedHash = keccak256(abi.encodePacked(voucher));
        if(_isUsed[computedHash]) return false;
        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = _hashPair(computedHash, proof[i]);
        }
        return _rootHashVoucher[_tokenId] == computedHash;
    }

    function _validateClaimAddress(
        string memory voucher, 
        address _to, 
        bytes memory sig)internal pure returns(address)
    {
       
        // require( getSignatureAddress(voucher, _tokenId, _to, sig) == owner(), "Address not valid");
        require( getSignatureAddress(voucher, _to, sig) == _to, "Address not valid");
        return _to;
    }

    function _hashPair(bytes32 a, bytes32 b)
        private
        pure
        returns(bytes32)
    {
        return a < b ? _efficientHash(a, b) : _efficientHash(b, a);
    }

    function _efficientHash(bytes32 a, bytes32 b)
        private
        pure
        returns (bytes32 value)
    {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }

    
    function getSignatureAddress(
        string memory voucher, 
        address _to, 
        bytes memory _signature) internal pure returns(address)
    {
        bytes32 hash = keccak256(abi.encodePacked(voucher, _to));
        bytes32 _messageHash = keccak256(abi.encodePacked(
            '\x19Ethereum Signed Message:\n32', 
            hash
            ));
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {       
            // first 32 bytes, after the length prefix
            r := mload(add(_signature, 32))
            // second 32 bytes
            s := mload(add(_signature, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(_signature, 96)))
        } 
        return ecrecover(_messageHash, v, r, s);
    }

    function setTokenURI(uint256 _tokenId, string calldata _tokenURI) external onlyCreator(_tokenId) {
        require(!contains("ipfs", uri(_tokenId)), "metadata is already frozen");
        _setURI(_tokenId, _tokenURI);
    }

    function contains (string memory what, string memory where) internal pure returns(bool) {
        bytes memory whatBytes = bytes (what);
        bytes memory whereBytes = bytes (where);

        require(whereBytes.length >= whatBytes.length);

        bool found = false;
        for (uint i = 0; i <= whereBytes.length - whatBytes.length; i++) {
            bool flag = true;
            for (uint j = 0; j < whatBytes.length; j++)
                if (whereBytes [i + j] != whatBytes [j]) {
                    flag = false;
                    break;
                }
            if (flag) {
                found = true;
                break;
            }
        }
        return found;
    }
}
