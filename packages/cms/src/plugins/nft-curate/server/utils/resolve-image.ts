import ipfsImage from './ipfs-image';

const resolveImage = (url: string) => {
  if (!url) return '';
  if (url.startsWith('ipfs://')) {
    return ipfsImage(url);
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${process.env.NUSA_BACKEND_UPLOAD_URL}/${url}`;
};


export default resolveImage;
