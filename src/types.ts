export type KboAddress = {
  street: string;
  houseNumber: string;
  postalZone: string;
  city: string;
  country: string;
};

export type KboContact = {
  type: string;
  value: string;
};

export type KboLookupResult = {
  enterpriseNumber: string;
  name: string;
  addresses: KboAddress[];
  contacts: KboContact[];
  juridicalForm?: string;
  status?: string;
};
