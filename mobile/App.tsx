import React, { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const configuredUrl = process.env.EXPO_PUBLIC_WEB_URL || '';
function validUrl(value: string) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

/** Native shell for the shared responsive atlas; connected mode only. */
export default function App() {
  const webview = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const ready = validUrl(configuredUrl);
  const origin = ready ? new URL(configuredUrl).origin : '';
  return <SafeAreaProvider>
    <StatusBar barStyle="dark-content" backgroundColor="#faf9f5" />
    <SafeAreaView style={styles.container}>
      {!ready ? <View style={styles.message}>
        <Text style={styles.symbol}>✧</Text>
        <Text style={styles.title}>Athar</Text>
        <Text style={styles.body}>Configurez EXPO_PUBLIC_WEB_URL avec l’adresse HTTPS de votre atlas, puis redémarrez Expo.</Text>
      </View> : failed ? <View style={styles.message}>
        <Text style={styles.title}>L’atlas est indisponible</Text>
        <Text style={styles.body}>Vérifiez votre connexion et l’adresse du serveur.</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setFailed(false); setKey(current => current + 1); }}><Text style={styles.buttonText}>Réessayer</Text></Pressable>
      </View> : <WebView
        key={key}
        ref={webview}
        source={{ uri: configuredUrl }}
        style={styles.webview}
        originWhitelist={[origin]}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        onError={() => setFailed(true)}
        onHttpError={event => { if (event.nativeEvent.statusCode >= 500) setFailed(true); }}
        onShouldStartLoadWithRequest={request => {
          if (request.url === 'about:blank' || request.url.startsWith('blob:')) return true;
          try {
            const destination = new URL(request.url);
            if (destination.origin === origin) return true;
            if (destination.protocol === 'https:' || destination.protocol === 'http:') void Linking.openURL(request.url);
          } catch { /* Ignore malformed navigation requests. */ }
          return false;
        }}
        renderLoading={() => <View style={styles.loader}><ActivityIndicator size="large" color="#2a5844" /></View>}
      />}
    </SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f5' },
  webview: { flex: 1, backgroundColor: '#faf9f5' },
  message: { flex: 1, padding: 35, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 50, color: '#b29353', marginBottom: 20 },
  title: { fontSize: 27, fontWeight: '500', color: '#294c3c', marginBottom: 15 },
  body: { textAlign: 'center', color: '#7b8875', fontSize: 15, lineHeight: 24 },
  button: { marginTop: 28, backgroundColor: '#294e3d', paddingVertical: 13, paddingHorizontal: 25, borderRadius: 7 },
  buttonText: { color: '#fffdf5', fontSize: 14 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf9f5' },
});
