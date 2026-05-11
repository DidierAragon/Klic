import * as TaskManager from 'expo-task-manager';
import { AppRegistry } from 'react-native';

// Definir la tarea inmediatamente antes de cualquier otro import
const TASK_NAME = 'StripeKeepJsAwakeTask';

TaskManager.defineTask(TASK_NAME, () => {
  // Tarea para mantener JS activo durante pagos
});

// Fallback para Android Headless
try {
  AppRegistry.registerHeadlessTask(TASK_NAME, () => async () => {
    // Tarea headless para Android
  });
} catch (e) {
  // Ignorar si ya está registrada
}

import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
