import emailjs from '@emailjs/browser'

// Datos mínimos que necesita cualquier vía de aviso de reserva.
export interface DatosReservaNotif {
  nombre: string
  email?: string
  telefono?: string
  personas: number
  fechaHora: Date
  notas?: string
}

const fmtFecha = (d: Date) =>
  d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' })
const fmtHora = (d: Date) =>
  d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * Avisos de confirmación de reserva al cliente.
 * - Email: automático vía EmailJS (plantilla VITE_EMAILJS_TEMPLATE_RESERVA_ID).
 * - WhatsApp: enlace `wa.me` con el mensaje ya redactado — envío manual de 1 clic.
 */
export function useReservaNotify() {
  /**
   * Envía el email de confirmación de reserva.
   * Devuelve `true` si se envió, `false` si no había email o falta configuración.
   * Lanza si EmailJS rechaza el envío (el llamador decide cómo avisar).
   */
  const enviarEmailReserva = async (
    reserva: DatosReservaNotif,
    nombreNegocio: string
  ): Promise<boolean> => {
    const email = (reserva.email ?? '').trim()
    if (!email) return false

    const serviceID = import.meta.env.VITE_EMAILJS_SERVICE_ID
    const templateID = import.meta.env.VITE_EMAILJS_TEMPLATE_RESERVA_ID
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    if (!serviceID || !templateID || !publicKey) return false

    await emailjs.send(serviceID, templateID, {
      user_email: email,
      cliente: reserva.nombre,
      negocio: nombreNegocio,
      fecha: fmtFecha(reserva.fechaHora),
      hora: fmtHora(reserva.fechaHora),
      personas: String(reserva.personas),
      notas: (reserva.notas ?? '').trim() || '—',
    }, publicKey)
    return true
  }

  /**
   * Construye el enlace `wa.me` con el mensaje de confirmación ya escrito.
   * El camarero/admin solo pulsa enviar. Devuelve '' si la reserva no tiene teléfono.
   */
  const linkWhatsAppReserva = (
    reserva: DatosReservaNotif,
    nombreNegocio: string
  ): string => {
    const tel = (reserva.telefono ?? '').replace(/\D/g, '')
    if (!tel) return ''
    // Número de 9 dígitos sin prefijo → asumimos España (+34).
    const numero = tel.length === 9 ? `34${tel}` : tel
    const personas = `${reserva.personas} ${reserva.personas === 1 ? 'persona' : 'personas'}`
    const msg =
      `Hola ${reserva.nombre}, te confirmamos tu reserva en ${nombreNegocio} ` +
      `para el ${fmtFecha(reserva.fechaHora)} a las ${fmtHora(reserva.fechaHora)} ` +
      `(${personas}). ¡Te esperamos!`
    return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`
  }

  return { enviarEmailReserva, linkWhatsAppReserva }
}
