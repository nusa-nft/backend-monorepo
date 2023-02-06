const ipfsImage = (url: string) => {
  return `${process.env.IPFS_GATEWAY}${url.replace('ipfs://', '')}`;
};

export default ipfsImage;
