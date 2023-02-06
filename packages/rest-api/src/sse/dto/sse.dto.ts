export interface SaleData {
  listingId: number;
  assetContract: string;
  lister: string;
  buyer: string;
  quantityBought: number;
  totalPricePaid: number;
  createdAt: number;
  transactionHash: string;
}
