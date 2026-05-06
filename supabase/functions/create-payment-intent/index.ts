import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'
import Stripe from 'https://esm.sh/stripe@14.16.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '')

Deno.serve(async (req) => {
  console.log("--- Nueva petición recibida ---")
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' } })
  }

  try {
    // Cliente para verificar al usuario (usa el token del usuario)
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Cliente administrador para insertar en tablas (bypass RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: authError } = await supabaseUserClient.auth.getUser()
    if (authError || !user) {
      console.error("Error de autenticación:", authError)
      throw new Error('No autorizado')
    }

    // --- NUEVO: Asegurar que el usuario existe en la tabla pública 'users' ---
    console.log("Sincronizando usuario:", user.id)
    const { error: userSyncError } = await supabaseAdmin
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        nombre: user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario',
        fecha_nacimiento: user.user_metadata?.fecha_nacimiento || '2000-01-01',
        verificado_edad: true,
        es_creador: false,
        acepto_terminos: true,
        fecha_aceptacion: new Date().toISOString(),
        created_at: user.created_at || new Date().toISOString()
      }, { onConflict: 'id' })
    
    if (userSyncError) {
      console.error("Error crítico: No se pudo sincronizar el usuario:", userSyncError)
      // Si el usuario no existe en 'users', la compra fallará por FK.
      // Intentamos seguir solo si el error no es de existencia.
    }

    const body = await req.json()
    console.log("Datos recibidos:", body)
    const { contentId, contentType, price, authorId } = body

    // --- NUEVO: Verificar si ya existe una compra exitosa ---
    const { data: existingPurchase } = await supabaseAdmin
      .from('compras')
      .select('id, estado')
      .eq('comprador_id', user.id)
      .eq('contenido_id', contentId)
      .maybeSingle()

    if (existingPurchase?.estado === 'completado') {
      throw new Error('Ya posees este contenido.')
    }

    // 1. Asegurar que el contenido existe en 'contenido_premium'
    console.log(`Verificando contenido en contenido_premium para ID: ${contentId}`)
    
    // Buscamos solo la columna que existe según el tipo
    const columnToSelect = contentType === 'opiniones' ? 'contenido' : 'url'
    const { data: sourceData, error: sourceError } = await supabaseAdmin
      .from(contentType)
      .select(columnToSelect)
      .eq('id', contentId)
      .single()

    if (sourceError) {
      console.error("No se encontró el contenido original:", sourceError)
    }

    const finalUrl = sourceData?.url || sourceData?.contenido || 'url_no_disponible'

    // Hacemos un UPSERT en contenido_premium para que la llave foránea no falle
    const { error: premiumError } = await supabaseAdmin
      .from('contenido_premium')
      .upsert({
        id: contentId,
        creador_id: authorId,
        url: finalUrl,
        precio: price,
        descripcion: `Compra de ${contentType}`
      }, { onConflict: 'id' })

    if (premiumError) {
      console.error("Error al registrar en contenido_premium:", premiumError)
    }

    console.log("Creando PaymentIntent en Stripe...")
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: user.id,
        contentId: contentId,
        contentType: contentType,
        authorId: authorId
      },
    })
    console.log("PaymentIntent creado:", paymentIntent.id)

    console.log("Insertando en tabla compras...")
    const comisionVal = Number((price * 0.20).toFixed(2))
    console.log("Valor de comisión calculado:", comisionVal)

    const { error: dbError } = await supabaseAdmin
      .from('compras')
      .upsert({
        comprador_id: user.id,
        user_id: authorId, // ID del creador/vendedor
        contenido_id: contentId,
        tipo_contenido: contentType,
        monto_pagado: Number(price),
        comision_plataforma: comisionVal, 
        estado: 'pendiente',
        stripe_id: paymentIntent.id
      }, { onConflict: 'comprador_id,contenido_id' })

    if (dbError) {
      console.error("Error en DB:", dbError)
      throw dbError
    }

    console.log("¡Todo listo! Enviando clientSecret.")
    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (error) {
    console.error("Error fatal en la función:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
