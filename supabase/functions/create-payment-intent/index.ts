import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

Deno.serve(async (req) => {
  console.log("--- Nueva petición recibida ---")
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' } })
  }

  try {
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
    if (authError || !user) {
      console.error("Error de autenticación:", authError)
      throw new Error('No autorizado')
    }

    const body = await req.json()
    console.log("Datos recibidos:", body)
    const { contentId, contentType, price, authorId, purchaseType, packageId, amount, coins } = body

    // 1. Lógica de MONEDAS (Bypass DB compras para evitar errores de esquema)
    if (purchaseType === 'coins') {
      console.log("Procesando compra de MONEDAS...")
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          userId: user.id,
          purchaseType: 'coins',
          packageId: packageId,
          coins: coins
        },
      })

      // No insertamos en 'compras' para evitar errores si la tabla es restrictiva
      // El crédito se procesará en sync-compra-stripe basándose en la metadata de Stripe

      return new Response(
        JSON.stringify({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // 2. Lógica de CONTENIDO (Se mantiene original para no romper lo que ya funciona)
    function edadDesdeFecha(fecha: string | null | undefined): number | null {
      if (!fecha || !/^\d{4}-\d{2}-\d{2}/.test(fecha)) return null
      const nac = new Date(fecha)
      if (Number.isNaN(nac.getTime())) return null
      const hoy = new Date()
      let edad = hoy.getFullYear() - nac.getFullYear()
      const m = hoy.getMonth() - nac.getMonth()
      if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
      return edad
    }

    const { data: perfil } = await supabaseAdmin
      .from('users')
      .select('fecha_nacimiento')
      .eq('id', user.id)
      .maybeSingle()

    const fechaNac = perfil?.fecha_nacimiento ?? (user.user_metadata?.fecha_nacimiento as string | undefined) ?? null
    const edad = edadDesdeFecha(fechaNac)
    
    if (edad === null || edad < 18) {
      throw new Error('Debes ser mayor de 18 años para realizar compras de contenido.')
    }

    // Sincronizar usuario
    await supabaseAdmin.from('users').upsert({
      id: user.id,
      email: user.email,
      nombre: user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario',
      fecha_nacimiento: fechaNac,
      verificado_edad: true,
      created_at: user.created_at || new Date().toISOString()
    }, { onConflict: 'id' })

    const { data: existingPurchase } = await supabaseAdmin
      .from('compras')
      .select('id, estado')
      .eq('comprador_id', user.id)
      .eq('contenido_id', contentId)
      .maybeSingle()

    if (existingPurchase?.estado === 'completado') {
      throw new Error('Ya posees este contenido.')
    }

    const columnToSelect = contentType === 'opiniones' ? 'contenido' : 'url'
    const { data: sourceData } = await supabaseAdmin
      .from(contentType)
      .select(columnToSelect)
      .eq('id', contentId)
      .single()

    const finalUrl = sourceData?.url || sourceData?.contenido || 'url_no_disponible'

    await supabaseAdmin.from('contenido_premium').upsert({
      id: contentId,
      creador_id: authorId,
      url: finalUrl,
      precio: price,
      descripcion: `Compra de ${contentType}`
    }, { onConflict: 'id' })

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: { userId: user.id, contentId, contentType, authorId },
    })

    const comisionVal = Number((price * 0.20).toFixed(2))

    const { error: dbError } = await supabaseAdmin
      .from('compras')
      .upsert({
        comprador_id: user.id,
        user_id: authorId,
        contenido_id: contentId,
        tipo_contenido: contentType,
        monto_pagado: Number(price),
        comision_plataforma: comisionVal, 
        estado: 'pendiente',
        stripe_id: paymentIntent.id
      }, { onConflict: 'comprador_id,contenido_id' })

    if (dbError) throw dbError

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error("Error fatal:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
