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

/** Minimum WCAG contrast vs white for customer name text on light UI. */
const MIN_WHITE_CONTRAST = 4.5;

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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const value = normalizeCustomerColor(hex);
  if (!value) {
    return null;
  }
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  );
}

function contrastWithWhite(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return 0;
  }
  const luminance = relativeLuminance(rgb.r, rgb.g, rgb.b);
  return 1.05 / (luminance + 0.05);
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  return { h, s: s * 100, l: l * 100 };
}

/** True when the color is dark enough to read on a white background. */
export function isReadableCustomerColorOnWhite(raw: string): boolean {
  const hex = normalizeCustomerColor(raw);
  return Boolean(hex) && contrastWithWhite(hex) >= MIN_WHITE_CONTRAST;
}

/**
 * Keep hue/saturation; darken until the color reads well on white.
 * Returns "" when input is not a valid hex color.
 */
export function toDarkCustomerColor(raw: string): string {
  const hex = normalizeCustomerColor(raw);
  if (!hex) {
    return "";
  }
  if (contrastWithWhite(hex) >= MIN_WHITE_CONTRAST) {
    return hex;
  }

  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "";
  }

  let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  s = Math.min(s, 72);
  for (let step = 0; step < 60; step++) {
    l = Math.max(10, l - 2);
    const candidate = hslToHex(h, s, l);
    if (contrastWithWhite(candidate) >= MIN_WHITE_CONTRAST) {
      return candidate;
    }
    if (l <= 10) {
      break;
    }
  }
  return hslToHex(h, Math.min(s, 65), 22);
}

export function findCustomerColorConflict(
  customers: CustomerEntry[],
  color: string,
  excludeId?: string,
): CustomerEntry | undefined {
  const key = toDarkCustomerColor(color) || normalizeCustomerColor(color);
  if (!key) {
    return undefined;
  }
  return customers.find(
    (customer) =>
      customer.id !== excludeId &&
      (toDarkCustomerColor(customer.color) ||
        normalizeCustomerColor(customer.color)) === key,
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

/** Random dark readable color that is not already in `usedColors`. */
export function generateUniqueCustomerColor(
  usedColors: Iterable<string>,
): string {
  const used = new Set(
    [...usedColors]
      .map((color) => toDarkCustomerColor(color) || normalizeCustomerColor(color))
      .filter(Boolean),
  );

  for (let attempt = 0; attempt < 800; attempt++) {
    const h = Math.floor(Math.random() * 360);
    const s = 45 + Math.floor(Math.random() * 30);
    const l = 18 + Math.floor(Math.random() * 22);
    const hex = toDarkCustomerColor(hslToHex(h, s, l));
    if (hex && !used.has(hex) && isReadableCustomerColorOnWhite(hex)) {
      return hex;
    }
  }

  for (let i = 0; i <= 0xffffff; i++) {
    const hex = `#${i.toString(16).padStart(6, "0")}`;
    if (
      !used.has(hex) &&
      isReadableCustomerColorOnWhite(hex)
    ) {
      return hex;
    }
  }

  return "#1a1a1a";
}

/** Fill missing/duplicate/light colors so every customer has a unique dark color. */
export function ensureCustomerColors(customers: CustomerEntry[]): {
  customers: CustomerEntry[];
  changed: boolean;
} {
  const used = new Set<string>();
  let changed = false;

  const next = customers.map((customer) => {
    const key = toDarkCustomerColor(customer.color);
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
    color: toDarkCustomerColor(raw.color ?? ""),
  };
}
