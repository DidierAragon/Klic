import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTema } from '../../context/TemaContext';
import { useWallet } from '../../context/WalletContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import KlicCoin from '../../components/KlicCoin';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '../../services/supabase';

const WalletScreen = ({ navigation }) => {
  const { palette, glow } = useTema();
  const { balance, packages, loading, refreshWallet } = useWallet();
  const [buying, setBuying] = useState(false);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handleBuyPackage = async (pkg) => {
    setBuying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Inicia sesión para comprar');

      // Create Payment Intent via Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('create-payment-intent', {
        body: { 
          purchaseType: 'coins',
          packageId: pkg.id,
          amount: pkg.price_usd,
          coins: pkg.coins_amount
        }
      });

      if (functionError || !data?.clientSecret) {
        throw new Error(functionError?.message || 'Error al iniciar pago');
      }

      // Init Stripe Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'Klic App',
        allowsDelayedPaymentMethods: true,
      });

      if (initError) throw initError;

      // Present Stripe Sheet
      const { error: paymentError } = await presentPaymentSheet();
      if (paymentError) {
        if (paymentError.code === 'Canceled') return;
        throw paymentError;
      }

      // Sync with DB
      const { error: syncErr } = await supabase.functions.invoke('sync-compra-stripe', {
        body: { paymentIntentId: data.paymentIntentId },
      });

      if (syncErr) console.warn('Sync error:', syncErr.message);

      await refreshWallet();
      alert(`¡Éxito! Has recibido ${pkg.coins_amount} monedas.`);
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setBuying(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.bg }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: palette.text }]}>Mi Billetera</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance Card */}
        <LinearGradient
          colors={[palette.primary, palette.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.balanceCard, glow]}
        >
          <Text style={styles.balanceLabel}>Saldo Actual</Text>
          <View style={styles.balanceRow}>
            <KlicCoin size={60} />
            <Text style={[styles.balanceValue, { marginLeft: 15 }]}>{balance.toLocaleString()}</Text>
          </View>
          <Text style={styles.balanceSub}>Klic Coins</Text>
        </LinearGradient>

        <Text style={[styles.sectionTitle, { color: palette.text }]}>Comprar Monedas</Text>
        
        {loading ? (
          <ActivityIndicator color={palette.primary} size="large" style={{ marginTop: 20 }} />
        ) : (
          <View style={styles.packagesGrid}>
            {packages.map((pkg) => (
              <TouchableOpacity
                key={pkg.id}
                style={[styles.packageCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
                onPress={() => handleBuyPackage(pkg)}
                disabled={buying}
              >
                <View style={styles.packageIcon}>
                  <KlicCoin size={40} />
                </View>
                <Text style={[styles.packageName, { color: palette.text }]}>{pkg.name}</Text>
                <Text style={[styles.packageAmount, { color: palette.primary }]}>{pkg.coins_amount} Monedas</Text>
                <View style={[styles.priceTag, { backgroundColor: palette.primary }]}>
                  <Text style={styles.priceText}>${pkg.price_usd}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: palette.text, marginTop: 30 }]}>¿Para qué sirven?</Text>
        <View style={[styles.infoCard, { backgroundColor: palette.panel }]}>
          <InfoItem 
            icon="eye-outline" 
            title="Contenido Premium" 
            desc="Desbloquea fotos y videos exclusivos de tus creadores favoritos." 
            palette={palette}
          />
          <InfoItem 
            icon="heart-outline" 
            title="Enviar Propinas" 
            desc="Apoya directamente a los creadores que más te gustan." 
            palette={palette}
          />
          <InfoItem 
            icon="star-outline" 
            title="Funciones Especiales" 
            desc="Acceso a chats privados y personalización de perfil." 
            palette={palette}
          />
        </View>
      </ScrollView>

      {buying && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={palette.primary} size="large" />
          <Text style={{ color: '#fff', marginTop: 10 }}>Procesando...</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const InfoItem = ({ icon, title, desc, palette }) => (
  <View style={styles.infoItem}>
    <View style={[styles.infoIcon, { backgroundColor: palette.bg }]}>
      <Ionicons name={icon} size={20} color={palette.primary} />
    </View>
    <View style={styles.infoText}>
      <Text style={[styles.infoTitle, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.infoDesc, { color: palette.textMuted }]}>{desc}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50, // Added more padding for status bar
    paddingBottom: 15,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 30,
    alignItems: 'center',
    marginBottom: 30,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginBottom: 10,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceValue: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '900',
    marginLeft: 10,
  },
  balanceSub: {
    color: '#fff',
    fontSize: 18,
    opacity: 0.9,
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  packageCard: {
    width: '48%',
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    borderWidth: 1,
    alignItems: 'center',
  },
  packageIcon: {
    marginBottom: 10,
  },
  packageName: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.7,
  },
  packageAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginVertical: 5,
  },
  priceTag: {
    marginTop: 10,
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 12,
  },
  priceText: {
    color: '#fff',
    fontWeight: '700',
  },
  infoCard: {
    borderRadius: 20,
    padding: 20,
  },
  infoItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  infoDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  }
});

export default WalletScreen;
