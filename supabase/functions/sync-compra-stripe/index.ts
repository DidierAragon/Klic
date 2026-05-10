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
    if (!paymentIntentId) throw new Error('paymentIntentId requerido')

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)

    // --- MANEJO DE MONEDAS (Bypass tabla compras) ---
    if (pi.metadata.purchaseType === 'coins') {
      if (pi.status !== 'succeeded') {
         return new Response(JSON.stringify({ ok: false, status: pi.status }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
      }
      
      if (pi.metadata.userId !== user.id) throw new Error('No autorizado para este pago')

      const coinsToAdd = parseInt(pi.metadata.coins || '0')
      console.log(`Acreditando ${coinsToAdd} monedas a user ${user.id}`)
      
      // 1. Asegurar que existe la billetera (UPSERT)
      await supabaseAdmin.from('wallets').upsert({ user_id: user.id }, { onConflict: 'user_id' })

      // 2. Sumar balance mediante RPC
      const { error: walletErr } = await supabaseAdmin.rpc('increment_wallet_balance', {
        p_user_id: user.id,
        p_amount: coinsToAdd
      })

      if (walletErr) {
        console.error("RPC Falló, intentando actualización manual:", walletErr)
        const { data: wallet } = await supabaseAdmin.from('wallets').select('balance').eq('user_id', user.id).single()
        await supabaseAdmin.from('wallets').update({ balance: (wallet?.balance || 0) + coinsToAdd }).eq('user_id', user.id)
      }

      // 3. Registrar transacción
      await supabaseAdmin.from('coin_transactions').insert({
        user_id: user.id,
        type: 'purchase',
        amount: coinsToAdd,
        description: `Compra de monedas via Stripe`,
        metadata: { stripe_id: paymentIntentId }
      })

      return new Response(JSON.stringify({ ok: true, status: 'succeeded' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    // --- Lógica original para CONTENIDO ---
    const { data: compraRow } = await supabaseAdmin
      .from('compras')
      .select('comprador_id')
      .eq('stripe_id', paymentIntentId)
      .maybeSingle()

    if (!compraRow || compraRow.comprador_id !== user.id) {
      throw new Error('No autorizado para este pago')
    }

    if (pi.status !== 'succeeded') {
      return new Response(JSON.stringify({ ok: false, status: pi.status }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    await supabaseAdmin
      .from('compras')
      .update({ estado: 'completado' })
      .eq('stripe_id', paymentIntentId)
      .eq('comprador_id', user.id)

    return new Response(JSON.stringify({ ok: true, status: 'succeeded' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })

  } catch (error) {
    console.error("Error en sync:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
