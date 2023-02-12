export const toString = (value: any) => {
  let stringVal = value.toString();
  if (stringVal.includes('e+')) {
    stringVal = Number(stringVal).toLocaleString('fullwide', {
      useGrouping: false,
    });
  }
  return stringVal;
};
