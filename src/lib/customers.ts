export type CustomerEntry = {
  id: string;
  customerId: string;
  customerName: string;
  email: string;
  pocName: string;
  pocEmail: string;
  billToAddress: string;
  apNumber: string;
  /** Unique per customer, stored as #rrggbb. */
  color: string;
};

export function normalizeCustomerColor(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^[0-9a-f]{6}$/.test(value)) {
    return `#${value}`;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return "";
}

export function isValidCustomerColor(raw: string): boolean {
  return Boolean(normalizeCustomerColor(raw));
}

export function findCustomerColorConflict(
  customers: CustomerEntry[],
  color: string,
  excludeId?: string,
): CustomerEntry | undefined {
  const key = normalizeCustomerColor(color);
  if (!key) {
    return undefined;
  }
  return customers.find(
    (customer) =>
      customer.id !== excludeId &&
      normalizeCustomerColor(customer.color) === key,
  );
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Random readable color that is not already in `usedColors`. */
export function generateUniqueCustomerColor(
  usedColors: Iterable<string>,
): string {
  const used = new Set(
    [...usedColors]
      .map((color) => normalizeCustomerColor(color))
      .filter(Boolean),
  );

  for (let attempt = 0; attempt < 800; attempt++) {
    const h = Math.floor(Math.random() * 360);
    const s = 55 + Math.floor(Math.random() * 35);
    const l = 35 + Math.floor(Math.random() * 25);
    const hex = hslToHex(h, s, l);
    if (!used.has(hex)) {
      return hex;
    }
  }

  for (let i = 0; i <= 0xffffff; i++) {
    const hex = `#${i.toString(16).padStart(6, "0")}`;
    if (!used.has(hex)) {
      return hex;
    }
  }

  return "#000000";
}

/** Fill missing/duplicate colors so every customer has a unique color. */
export function ensureCustomerColors(customers: CustomerEntry[]): {
  customers: CustomerEntry[];
  changed: boolean;
} {
  const used = new Set<string>();
  let changed = false;

  const next = customers.map((customer) => {
    const key = normalizeCustomerColor(customer.color);
    if (key && !used.has(key)) {
      used.add(key);
      if (customer.color === key) {
        return customer;
      }
      changed = true;
      return { ...customer, color: key };
    }

    const color = generateUniqueCustomerColor(used);
    used.add(color);
    changed = true;
    return { ...customer, color };
  });

  return { customers: next, changed };
}

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
    color: normalizeCustomerColor(raw.color ?? ""),
  };
}
