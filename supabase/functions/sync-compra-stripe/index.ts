import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No autorizado')

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) throw new Error('No autorizado')

    const body = await req.json()
    const paymentIntentId = body?.paymentIntentId as string | undefined
    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      throw new Error('paymentIntentId requerido')
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)

    const { data: compraRow } = await supabaseAdmin
      .from('compras')
      .select('comprador_id')
      .eq('stripe_id', paymentIntentId)
      .maybeSingle()

    if (!compraRow || compraRow.comprador_id !== user.id) {
      throw new Error('No autorizado para este pago')
    }

    if (pi.status !== 'succeeded') {
      return new Response(
        JSON.stringify({ ok: false, status: pi.status }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { error: upErr } = await supabaseAdmin
      .from('compras')
      .update({ estado: 'completado' })
      .eq('stripe_id', paymentIntentId)
      .eq('comprador_id', user.id)

    if (upErr) throw upErr

    return new Response(
      JSON.stringify({ ok: true, status: 'succeeded' }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
