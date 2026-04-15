import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../store/authStore'

import LoginScreen         from '../screens/LoginScreen'
import LoteScreen          from '../screens/LoteScreen'
import MainScreen          from '../screens/MainScreen'
import HomeScreen          from '../screens/HomeScreen'
import VehicleSelectScreen from '../screens/VehicleSelectScreen'
import TripScreen          from '../screens/TripScreen'
import HistoryScreen       from '../screens/HistoryScreen'

const Stack = createNativeStackNavigator()

const DARK_HEADER = {
  headerStyle:      { backgroundColor: '#0f172a' },
  headerTintColor:  '#f1f5f9',
  headerTitleStyle: { fontWeight: '600', fontSize: 16 },
  headerShadowVisible: false,
}

export default function AppNavigator() {
  const token = useAuthStore((s) => s.token)

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ ...DARK_HEADER, animation: 'slide_from_right' }}>
        {!token ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            {/* Validación de lote — primera pantalla, sin back ni gesto */}
            <Stack.Screen
              name="Lote"
              component={LoteScreen}
              options={{ title: 'Validación de lote', headerLeft: () => null, gestureEnabled: false }}
            />

            {/* Pantalla principal del repartidor (mapa + barra custom) */}
            <Stack.Screen
              name="MainTabs"
              component={MainScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />

            {/* Flujo legacy de viajes por vehículo */}
            <Stack.Screen name="Home"          component={HomeScreen}          options={{ title: 'FleetTrack', headerLeft: () => null }} />
            <Stack.Screen name="VehicleSelect" component={VehicleSelectScreen} options={{ title: 'Seleccionar vehículo' }} />
            <Stack.Screen name="Trip"          component={TripScreen}          options={{ title: 'Viaje activo', headerLeft: () => null, gestureEnabled: false }} />
            <Stack.Screen name="History"       component={HistoryScreen}       options={{ title: 'Mis viajes' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
