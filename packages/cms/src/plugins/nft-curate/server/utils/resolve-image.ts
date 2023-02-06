import ipfsImage from './ipfs-image';

const resolveImage = (url: string) => {
  console.log(process.env.NUSA_BACKEND_UPLOAD_URL);
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return ipfsImage(url);
  }
  return `${process.env.NUSA_BACKEND_UPLOAD_URL}${url}`;
};

export default resolveImage;
