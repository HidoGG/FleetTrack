import 'react-native-gesture-handler'
import { useEffect } from 'react'
import { Platform, StatusBar } from 'react-native'
import { registerRootComponent } from 'expo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as NavigationBar from 'expo-navigation-bar'
import AppNavigator from './src/navigation/AppNavigator'

function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Ocultar StatusBar nativa (la de arriba)
      StatusBar.setHidden(true, 'none')

      // Ocultar barra de navegación del sistema (botones de abajo)
      // Behavior "overlay-swipe": aparece momentáneamente al deslizar desde el borde
      NavigationBar.setVisibilityAsync('hidden')
        .then(() => NavigationBar.setBehaviorAsync('overlay-swipe'))
        .catch(() => {/* silenciar en Expo Go si no soporta */})
    }
  }, [])

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  )
}

registerRootComponent(App)
