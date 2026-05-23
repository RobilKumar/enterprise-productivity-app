import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { createDrawerNavigator }      from '@react-navigation/drawer';
import { useSelector }                from 'react-redux';
import { View, Text, TouchableOpacity } from 'react-native';
import type { RootState }             from '../store';
import { useTheme }                   from '../hooks/useTheme';

// ─── Screens (lazy imports) ──────────────────────────────────
import { LoginScreen }      from './screens/index';
import { DashboardScreen }  from './screens/index';
import { TasksScreen }      from './screens/index';
import { TaskDetailScreen } from './screens/detail';
import { TimerScreen }      from './screens/detail';

// Placeholder screens
const Placeholder = (name: string) => () => (
  <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
    <Text style={{ fontSize: 20, fontWeight:'700' }}>{name}</Text>
  </View>
);

const KPIScreen           = Placeholder('KPI & Analytics');
const ChatScreen          = Placeholder('Chat');
const ProfileScreen       = Placeholder('Profile');
const NotificationsScreen = Placeholder('Notifications');
const AttendanceScreen    = Placeholder('Attendance');
const LeaveScreen         = Placeholder('Leave Requests');
const LeaderboardScreen   = Placeholder('Leaderboard');
const AnnouncementsScreen = Placeholder('Announcements');
const CreateTaskScreen    = Placeholder('Create Task');
const SummaryScreen       = Placeholder('Daily Summary');
const SettingsScreen      = Placeholder('Settings');
const ShiftScreen         = Placeholder('Shifts');

const Stack  = createNativeStackNavigator();
const Tab    = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

// ─── Tab Navigator ────────────────────────────────────────────
function MainTabs() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarStyle:            { backgroundColor: colors.card, borderTopColor: colors.border, height: 64, paddingBottom: 8 },
        tabBarActiveTintColor:  colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown:            false,
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            Dashboard:  '🏠', Tasks: '📋', Timer: '⏱', KPI: '📊', Chat: '💬',
          };
          return <Text style={{ fontSize: size * 0.85 }}>{icons[route.name] || '•'}</Text>;
        },
      })}
    >
      <Tab.Screen name="Dashboard"  component={DashboardStack} />
      <Tab.Screen name="Tasks"      component={TasksStack} />
      <Tab.Screen name="Timer"      component={TimerScreen} />
      <Tab.Screen name="KPI"        component={KPIScreen} />
      <Tab.Screen name="Chat"       component={ChatScreen} />
    </Tab.Navigator>
  );
}

// ─── Dashboard Stack ─────────────────────────────────────────
function DashboardStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text }}>
      <Stack.Screen name="DashboardHome"  component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notifications"  component={NotificationsScreen} />
      <Stack.Screen name="Announcements"  component={AnnouncementsScreen} />
      <Stack.Screen name="TaskDetail"     component={TaskDetailScreen} options={{ title: 'Task Details' }} />
    </Stack.Navigator>
  );
}

// ─── Tasks Stack ──────────────────────────────────────────────
function TasksStack() {
  const { colors } = useTheme();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text }}>
      <Stack.Screen name="TasksList"   component={TasksScreen} options={{ title: 'My Tasks' }} />
      <Stack.Screen name="TaskDetail"  component={TaskDetailScreen} options={{ title: 'Task Details' }} />
      <Stack.Screen name="CreateTask"  component={CreateTaskScreen} options={{ title: 'New Task' }} />
    </Stack.Navigator>
  );
}

// ─── Drawer (full menu) ───────────────────────────────────────
function AppDrawer() {
  const { colors } = useTheme();

  return (
    <Drawer.Navigator
      screenOptions={{
        drawerStyle:          { backgroundColor: colors.card, width: 280 },
        drawerLabelStyle:     { color: colors.text, fontSize: 14, fontWeight: '500' },
        drawerActiveTintColor: colors.primary,
        headerShown:          false,
      }}
    >
      <Drawer.Screen name="Home"          component={MainTabs}          options={{ title: '🏠  Home',         drawerLabel: '🏠  Home' }} />
      <Drawer.Screen name="Profile"       component={ProfileScreen}     options={{ drawerLabel: '👤  My Profile' }} />
      <Drawer.Screen name="Attendance"    component={AttendanceScreen}  options={{ drawerLabel: '📅  Attendance' }} />
      <Drawer.Screen name="Leave"         component={LeaveScreen}       options={{ drawerLabel: '🌴  Leave Requests' }} />
      <Drawer.Screen name="Leaderboard"   component={LeaderboardScreen} options={{ drawerLabel: '🏆  Leaderboard' }} />
      <Drawer.Screen name="DailySummary"  component={SummaryScreen}     options={{ drawerLabel: '📝  Daily Summary' }} />
      <Drawer.Screen name="Shifts"        component={ShiftScreen}       options={{ drawerLabel: '🕐  Shifts' }} />
      <Drawer.Screen name="Settings"      component={SettingsScreen}    options={{ drawerLabel: '⚙️  Settings' }} />
    </Drawer.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────
export function RootNavigator() {
  const { user }   = useSelector((s: RootState) => s.auth);
  const { colors } = useTheme();

  return (
    <NavigationContainer
      theme={{
        dark: false,
        colors: {
          primary:    colors.primary,
          background: colors.background,
          card:       colors.card,
          text:       colors.text,
          border:     colors.border,
          notification: '#EF4444',
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {user ? (
          <Stack.Screen name="App"   component={AppDrawer} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
