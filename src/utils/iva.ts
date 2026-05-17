// IVA reducido de hostelería en España (bares y restaurantes).
// La hostelería tributa al 10%, no al 21% general.
export const TIPO_IVA = 0.10

// Porcentaje legible para la UI: "10".
export const TIPO_IVA_PCT = Math.round(TIPO_IVA * 100)

export interface DesgloseIva {
  base: number   // base imponible (sin IVA)
  iva: number    // cuota de IVA
  total: number  // total con IVA — lo que paga el cliente
  tipo: number   // tipo aplicado (0.10)
}

/**
 * Descompone un total que YA incluye IVA en base imponible + cuota.
 *
 * En España los precios al consumidor se muestran con IVA incluido, así que
 * el total NO cambia: solo se desglosa. El redondeo se hace de forma que
 * `base + iva === total` exactamente (al céntimo), evitando descuadres.
 */
export function desglosarIva(totalConIva: number): DesgloseIva {
  const total = Math.round((Number(totalConIva) || 0) * 100) / 100
  const iva = Math.round((total - total / (1 + TIPO_IVA)) * 100) / 100
  const base = Math.round((total - iva) * 100) / 100
  return { base, iva, total, tipo: TIPO_IVA }
}
