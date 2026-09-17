export type CustomerEntry = {
  id: string;
  customerId: string;
  customerName: string;
  email: string;
  pocName: string;
  pocEmail: string;
  billToAddress: string;
  apNumber: string;
};

export function normalizeCustomer(
  raw: Partial<CustomerEntry> & { id: string },
): CustomerEntry {
  return {
    id: raw.id,
    customerId: raw.customerId ?? "",
    customerName: raw.customerName ?? "",
    email: raw.email ?? "",
    pocName: raw.pocName ?? "",
    pocEmail: raw.pocEmail ?? "",
    billToAddress: raw.billToAddress ?? "",
    apNumber: raw.apNumber ?? "",
  };
}
