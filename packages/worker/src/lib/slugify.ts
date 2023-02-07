import slugifyLib from 'slugify';

export const slugify = (name: string) => {
  return slugifyLib(name, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g,
  });
};
