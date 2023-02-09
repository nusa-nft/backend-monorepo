export interface BlockchainTxPayload {
  method: string;
  args: any[];
  extraData?: any;
}

export interface RecentlySoldItem {
  itemId: number;
  name: string;
  image: string;
  pricePaid: string;
  createdAt: number;
}
