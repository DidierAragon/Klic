import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TemaProvider } from './src/context/TemaContext';
import { WalletProvider } from './src/context/WalletContext';
import FAB from './src/components/FAB';
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import HomeScreen from './src/screens/Home/HomeScreen';
import SmashOrPassScreen from './src/screens/SmashOrPass/SmashOrPassScreen';
import UploadPhotoScreen from './src/screens/Profile/UploadPhotoScreen';
import ProfileScreen from './src/screens/Profile/ProfileScreen';
import SettingsScreen from './src/screens/Settings/SettingsScreen';
import MatchesScreen from './src/screens/Chat/MatchesScreen';
import ChatScreen from './src/screens/Chat/ChatScreen';
import ComentariosScreen from './src/screens/Comments/ComentariosScreen';
import SocialScreen from './src/screens/Social/SocialScreen';
import ChatAmigoScreen from './src/screens/Chat/ChatAmigoScreen';
import CreatorDashboardScreen from './src/screens/Creator/CreatorDashboardScreen';
import WalletScreen from './src/screens/Profile/WalletScreen';
import { supabase } from './src/services/supabase';

const Stack = createNativeStackNavigator();

const SIN_FAB = ['UploadPhoto', 'Chat', 'ChatAmigo', 'Comentarios', 'CreatorDashboard', 'Login', 'Register'];

function AppInner({ session }) {
  const navigationRef = useNavigationContainerRef();
  const [rutaActual, setRutaActual] = useState('Home');

  const mostrarFAB = session && !SIN_FAB.includes(rutaActual);

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        onStateChange={() => {
          const nombre = navigationRef.getCurrentRoute()?.name;
          if (nombre) setRutaActual(nombre);
        }}
      >
        {session ? (
          <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="SmashOrPass" component={SmashOrPassScreen} />
            <Stack.Screen name="Social" component={SocialScreen} />
            <Stack.Screen name="Matches" component={MatchesScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="UploadPhoto" component={UploadPhotoScreen} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            <Stack.Screen name="ChatAmigo" component={ChatAmigoScreen} />
            <Stack.Screen name="Comentarios" component={ComentariosScreen} />
            <Stack.Screen name="CreatorDashboard" component={CreatorDashboardScreen} />
            <Stack.Screen name="Wallet" component={WalletScreen} />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Navigator>
        )}
      </NavigationContainer>

      {mostrarFAB && (
        <FAB navigation={navigationRef} />
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) setSession(data.session);
      setLoadingSession(false);
    };
    loadSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#07070b' }}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  return (
    <TemaProvider session={session}>
      <WalletProvider session={session}>
        <AppInner session={session} />
      </WalletProvider>
    </TemaProvider>
  );
}