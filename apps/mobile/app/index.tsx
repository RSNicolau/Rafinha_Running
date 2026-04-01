import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/auth.store';

export default function Index() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/landing" />;
  }

  switch (user?.role) {
    case 'COACH':
      return <Redirect href="/(coach)" />;
    case 'ADMIN':
      return <Redirect href="/(admin)" />;
    default:
      return <Redirect href="/(athlete)" />;
  }
}
