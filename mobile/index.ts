// Must be the very first import — react-native-gesture-handler needs to
// install its native event handling before anything else touches touch
// responders (React Navigation's native-stack depends on this; its absence
// is what caused scrolling and button taps to misbehave).
import "react-native-gesture-handler";
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
