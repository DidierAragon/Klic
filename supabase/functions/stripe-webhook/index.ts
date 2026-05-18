import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

const cryptoProvider = Stripe.createSubtleCryptoProvider()

function edadMayorIgual18(fecha: string | null | undefined): boolean {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return false
  const nac = new Date(fecha)
  if (Number.isNaN(nac.getTime())) return false
  const hoy = new Date()
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad >= 18
}

/** Comprobaciones de tarjeta de Stripe: solo fallamos si hay fallo explícito. */
function verificacionTarjetaStripeOk(pm: Stripe.PaymentMethod | null): boolean {
  if (!pm || pm.type !== 'card' || !pm.card?.checks) return true
  const c = pm.card.checks
  if (c.cvc_check === 'fail') return false
  if (c.address_postal_code_check === 'fail') return false
  if (c.address_line1_check === 'fail') return false
  return true
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  try {
    if (!signature) throw new Error('Sin firma de Stripe')

    const body = await req.text()
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      cryptoProvider
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const userId = paymentIntent.metadata?.userId

        let esPrimeraCompraCompletada = false
        if (userId) {
          const { count: prevCompletadas, error: countError } = await supabaseAdmin
            .from('compras')
            .select('*', { count: 'exact', head: true })
            .eq('comprador_id', userId)
            .eq('estado', 'completado')

          if (countError) {
            console.error('tarjeta_verificada: error contando compras', countError)
          } else {
            esPrimeraCompraCompletada = (prevCompletadas ?? 0) === 0
          }
        }

        await supabaseAdmin
          .from('compras')
          .update({ estado: 'completado' })
          .eq('stripe_id', paymentIntent.id)

        if (!userId || !esPrimeraCompraCompletada) break

        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('fecha_nacimiento, tarjeta_verificada')
          .eq('id', userId)
          .maybeSingle()

        if (userRow?.tarjeta_verificada) break
        if (!edadMayorIgual18(userRow?.fecha_nacimiento)) {
          console.warn(`tarjeta_verificada: usuario ${userId} no cumple edad en perfil`)
          break
        }

        const pi = await stripe.paymentIntents.retrieve(paymentIntent.id, {
          expand: ['payment_method'],
        })
        const pm = pi.payment_method
        const pmObj = typeof pm === 'string' ? null : pm
        if (!verificacionTarjetaStripeOk(pmObj)) {
          console.warn(`tarjeta_verificada: checks Stripe no superados para PI ${paymentIntent.id}`)
          break
        }

        const { error: updUserError } = await supabaseAdmin
          .from('users')
          .update({ tarjeta_verificada: true })
          .eq('id', userId)
          .eq('tarjeta_verificada', false)

        if (updUserError) {
          console.error('tarjeta_verificada: error actualizando users', updUserError)
        }
        break
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = event.data.object as Stripe.PaymentIntent
        await supabaseAdmin
          .from('compras')
          .update({ estado: 'fallido' })
          .eq('stripe_id', failedIntent.id)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        await supabaseAdmin
          .from('compras')
          .update({ estado: 'reembolsado' })
          .eq('stripe_id', charge.payment_intent as string)
        break
      }

      // --- EVENTOS DE SUSCRIPCIONES RECURRENTES ---
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const subscriberId = subscription.metadata?.subscriberId
        const creatorId = subscription.metadata?.creatorId

        if (subscriberId && creatorId) {
          const precioSuscripcion = subscription.items.data[0]?.price?.unit_amount 
            ? subscription.items.data[0].price.unit_amount / 100 
            : 0

          await supabaseAdmin
            .from('suscripciones')
            .upsert({
              subscriber_id: subscriberId,
              creator_id: creatorId,
              stripe_subscription_id: subscription.id,
              status: subscription.status, // 'active', 'incomplete', 'past_due', etc.
              precio: precioSuscripcion,
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            }, { onConflict: 'subscriber_id,creator_id' })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabaseAdmin
          .from('suscripciones')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id)
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(`Webhook Error: ${message}`, { status: 400 })
  }
})
