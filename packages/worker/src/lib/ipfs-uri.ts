export const nusaIpfsGateway = (uri) => {
  let ipfsPath = uri.split('ipfs')[1];
  console.log({ ipfsPath });
  const metadataUri = `${process.env.IPFS_GATEWAY}${ipfsPath}`;
  return metadataUri;
}

export const normalizeIpfsUri = (uri: string) => {
  if (uri.includes('ipfs')) {
    let ipfsPath = uri.split('ipfs')[1];
    console.log({ ipfsPath });
    const ipfsUri = `ipfs:/${ipfsPath}`;
    return ipfsUri;
  }
  return uri;
}