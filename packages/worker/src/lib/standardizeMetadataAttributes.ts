export default function standardizeMetadataAttribute(
  attributes: {
    trait_type: string;
    nusa_attribute_type: string;
    value: string;
    max_value: string;
    opensea_display_type?: string;
  }[],
) {
  const metadata = attributes.map((data) => {
    let _data: Record<string, any> = {
      trait_type: data.trait_type,
      value: data.value,
    };
    if (data.opensea_display_type) {
      _data = {
        ..._data,
        display_type: data.opensea_display_type,
      };
    }
    return _data;
  });
  return metadata;
}
