import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

const cryptoProvider = Stripe.createSubtleCryptoProvider()

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
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object
        await supabaseAdmin
          .from('compras')
          .update({ estado: 'completado' })
          .eq('stripe_id', paymentIntent.id)
        break

      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object
        await supabaseAdmin
          .from('compras')
          .update({ estado: 'fallido' })
          .eq('stripe_id', failedIntent.id)
        break
        
      case 'charge.refunded':
        const charge = event.data.object
        await supabaseAdmin
          .from('compras')
          .update({ estado: 'reembolsado' })
          .eq('stripe_id', charge.payment_intent)
        break
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
