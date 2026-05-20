import React, { useState, useEffect, useRef } from 'react';
import { 
  Car, 
  MapPin, 
  Search, 
  User, 
  ShieldCheck, 
  Wallet, 
  Clock, 
  CheckCircle2, 
  Navigation,
  ArrowRight,
  LogOut,
  Plus,
  Settings,
  Users,
  CreditCard,
  Filter,
  X,
  KeyRound,
  History as HistoryIcon,
  BellRing,
  Bell,
  Send,
  Phone,
  Lock,
  IndianRupee,
  AlertCircle,
  Star,
  MessageSquare,
  Trash2,
  Edit2,
  PlusCircle,
  Zap,
  XCircle,
  Activity,
  Eye,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  serverTimestamp,
  getDocFromServer,
  limit,
  arrayUnion,
  setDoc,
  runTransaction
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut
} from 'firebase/auth';
import { db, auth } from './firebase';

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full glass p-8 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <X className="w-10 h-10 text-rose-600" />
            </div>
            <h2 className="text-2xl font-black text-zinc-900">Application Error</h2>
            <p className="text-zinc-600 leading-relaxed">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg shadow-indigo-200"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { estimateFare } from './services/geminiService';
import { calculateRealFare, VEHICLE_RATES } from './services/mapsService';
import MapComponent from './components/Map';
import { io } from "socket.io-client";


async function triggerPushNotification(title: string, body: string, playAlarm: boolean = false) {
  if (!("Notification" in window)) return;
  
  const showNotification = () => {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.ico'
    });
    
    // Play alarm sound only if requested (for drivers)
    if (playAlarm) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.error('Audio play failed:', e));
    }
    
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  if (Notification.permission === "granted") {
    showNotification();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        showNotification();
      }
    });
  }
}

async function sendNotification(type: string, data: any) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data }),
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

const socket = io();

type View = 'user' | 'admin' | 'driver';
type RideStatus = 'pending' | 'accepted' | 'ongoing' | 'completed' | 'cancelled';

interface Ride {
  id: string;
  tracking_id: string;
  pickup_location: string;
  dropoff_location: string;
  pickup_coords?: { lat: number; lng: number } | null;
  dropoff_coords?: { lat: number; lng: number } | null;
  status: RideStatus;
  fare: number;
  discount?: number;
  vehicle_type: string;
  driver_id?: string;
  user_id?: string;
  driver_name?: string;
  driver_phone?: string;
  plate_number?: string;
  created_at: string;
  start_otp?: string;
  end_otp?: string;
  eta?: number;
  user_phone?: string;
  user_name?: string;
  trip_type?: 'single' | 'round';
  distance?: number;
  pickup_date?: string;
  pickup_time?: string;
  rating?: number;
  review?: string;
  complaint?: string;
  complaint_status?: 'pending' | 'resolved' | 'forwarded';
  complaint_reply?: string;
  complaint_user_reply?: string;
  complaint_driver_reply?: string; // Message from Admin to Driver
  complaint_driver_response?: string; // Reply from Driver to Admin/User
  complaint_forwarded_to_driver?: boolean;
  complaint_forwarded_to_admin_id?: string;
  complaint_forwarded_to_admin_name?: string;
  complaint_user_phone?: string;
  complaint_driver_phone?: string;
  complaint_admin_name?: string;
  advance_paid?: number;
  payment_id?: string;
  cancellation_reason?: string;
  actual_distance?: number;
  extra_charge?: number;
  final_total_fare?: number;
  passengers?: number;
}

interface AdminUser {
  id: string;
  username: string;
  password?: string;
  pin?: string;
  role: 'owner' | 'admin';
  created_at?: string;
  permissions?: {
    rides: boolean;
    drivers: boolean;
    users: boolean;
    withdrawals: boolean;
    notifications: boolean;
  };
}

interface Notification {
  id: string;
  message: string;
  target: 'all_drivers' | 'all_users' | 'specific_driver' | 'specific_user' | 'specific_admin' | 'admin_alert';
  driver_id?: string;
  user_id?: string;
  admin_id?: string;
  created_at: string;
  read_by: string[]; // List of user IDs who dismissed it
  seen_by?: { userId: string, seenAt: string }[]; // Track when each user first saw it
}

// --- Components ---

const Navbar = ({ activeView, setView, onLogout, user }: { activeView: View, setView: (v: View) => void, onLogout?: () => void, user: any }) => (
  <nav className="fixed top-0 left-0 right-0 bg-[#808000] z-50 shadow-lg">
    <div className="w-full px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <motion.span 
          whileHover={{ scale: 1.05 }}
          className="font-black text-2xl tracking-tighter text-white cursor-default"
        >
          SkyDrive
        </motion.span>
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-2 px-4 py-1.5 bg-white/10 text-white rounded-full border border-white/20"
          >
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {user.role === 'owner' ? 'Owner' : user.role === 'admin' ? 'Admin' : user.role === 'driver' ? 'Driver' : 'User'}
            </span>
          </motion.div>
        )}
        {onLogout && (
          <button onClick={onLogout} className="p-2 hover:bg-white/10 rounded-xl transition-all group flex items-center gap-2">
            <span className="hidden sm:inline text-xs font-bold text-white/80 group-hover:text-white">Logout</span>
            <LogOut className="w-5 h-5 text-white/70 group-hover:text-white" />
          </button>
        )}
      </div>
    </div>
  </nav>
);

const VAPID_PUBLIC_KEY = 'BC2F3-qn7u8AYKdqDSxY9ZMWRVqBYsd9e3lGQFX9jqpAid1SrmFISUM4BHAeBL6HP7QIKRId70iOu7stL5XeTf8';

export default function App() {
  // Handle Mobile Back Button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setView(event.state.view);
      } else {
        setView('user');
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Initial state
    window.history.replaceState({ view: 'user' }, '', '');

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const changeView = (newView: View) => {
    if (newView !== view) {
      // Permission checks
      if (newView === 'admin' && user?.role !== 'admin' && user?.role !== 'owner') {
        setToast({ message: 'Access Denied: Admin privileges required', type: 'error' });
        return;
      }
      if (newView === 'driver' && user?.role !== 'driver') {
        setToast({ message: 'Access Denied: Driver account required', type: 'error' });
        return;
      }

      window.history.pushState({ view: newView }, '', '');
      setView(newView);
      setTrackedRide(null);
      setTrackingId('');
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Artificial delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));
    setUser(null);
    localStorage.removeItem('skydrive_auth');
    setView('user');
    setTrackedRide(null);
    setTrackingId('');
    await signOut(auth);
    setIsLoggingOut(false);
  };
  const getStatusLabel = (status: RideStatus, advancePaid?: number) => {
    switch (status) {
      case 'pending': return advancePaid ? 'Confirmed' : 'Searching...';
      case 'accepted': return 'Accepted';
      case 'ongoing': return 'On the way';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const getStatusColor = (status: RideStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'accepted': return 'bg-blue-100 text-blue-700';
      case 'ongoing': return 'bg-emerald-600 text-white';
      case 'completed': return 'bg-emerald-100 text-emerald-700';
      case 'cancelled': return 'bg-rose-100 text-rose-700';
      default: return 'bg-zinc-100 text-zinc-700';
    }
  };
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const handleViewActivityDetails = async (log: any) => {
    if (!log.target_id || !log.target_type) return;

    try {
      if (log.target_type === 'driver') {
        const docRef = doc(db, 'drivers', log.target_id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEditingDriver({ ...docSnap.data(), id: docSnap.id });
          setToast({ message: "Viewing Driver Profile", type: 'success' });
        } else {
          setToast({ message: "Driver profile no longer exists", type: 'error' });
        }
      } else if (log.target_type === 'user') {
        const docRef = doc(db, 'users', log.target_id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setEditingUser({ ...docSnap.data(), id: docSnap.id });
          setToast({ message: "Viewing User Profile", type: 'success' });
        } else {
          setToast({ message: "User profile no longer exists", type: 'error' });
        }
      } else if (log.target_type === 'ride') {
        const docRef = doc(db, 'rides', log.target_id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const rideData = { ...docSnap.data(), id: docSnap.id } as Ride;
          setSearchCategory('rides');
          setSearchTerm(rideData.tracking_id);
          setToast({ message: `Found Ride: ${rideData.tracking_id}. Use search to view if list doesn't update.`, type: 'success' });
        } else {
          setToast({ message: "Ride records no longer exist", type: 'error' });
        }
      } else {
        setToast({ message: `Viewing details for ${log.target_type} ID: ${log.target_id}`, type: 'success' });
      }
    } catch (err) {
      console.error("Error viewing activity details:", err);
      setToast({ message: "Error loading details", type: 'error' });
    }
  };

  const logActivity = async (action: string, details: string, targetId?: string, targetType?: 'user' | 'driver' | 'ride' | 'withdrawal' | 'admin' | 'notification') => {
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) return;
    try {
      await addDoc(collection(db, 'activities'), {
        admin_id: user.id || (user as any).uid || 'unknown',
        admin_name: user.name || (user as any).username || 'Admin',
        admin_role: user.role,
        action,
        details,
        target_id: targetId || null,
        target_type: targetType || null,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error logging activity:", err);
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (user?.role !== 'owner') return;
    try {
      await deleteDoc(doc(db, 'activities', id));
      setToast({ message: 'Activity deleted', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `activities/${id}`);
    }
  };

  useEffect(() => {
    // Register Service Worker for Push Notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('SW registered:', reg);
          // Try to subscribe on load
          subscribeToPushNotifications();
        })
        .catch(err => console.error('SW registration failed:', err));
    }

    // Test Firestore connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        // Clear/handle any offline notices, proceed to check if Shafiq Choudhary owner exists
        try {
          const adminsSnapshot = await getDocs(collection(db, 'admins'));
          const shafiqExists = adminsSnapshot.docs.some(doc => doc.data().username === 'Shafiq Choudhary');
          if (!shafiqExists) {
            console.log("Seeding Owner Account (Shafiq Choudhary) from frontend...");
            await setDoc(doc(db, 'admins', 'shafiq_choudhary'), {
              username: 'Shafiq Choudhary',
              password: '7412',
              pin: '7412',
              role: 'owner',
              created_at: new Date().toISOString(),
              permissions: {
                rides: true,
                drivers: true,
                users: true,
                withdrawals: true,
                notifications: true
              }
            });
            console.log("Owner Account (Shafiq Choudhary) seeded from frontend!");
          }
        } catch (seedErr) {
          console.error("Error seeding owner credentials from frontend:", seedErr);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
          setToast({ message: 'Firebase connection error. Please check your internet.', type: 'error' });
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Try restoring from localStorage first for faster UX
      const savedUser = localStorage.getItem('skydrive_auth');
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          
          // Set view based on role
          if (parsedUser.role === 'admin' || parsedUser.role === 'owner') {
            setView('admin');
          } else if (parsedUser.role === 'driver') {
            setView('driver');
          } else {
            setView('user');
          }
        } catch (e) {
          console.error("Error restoring session:", e);
          localStorage.removeItem('skydrive_auth');
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Socket notification listener
    const handleNotification = ({ type, data }: { type: string, data: any }) => {
      // Alarm only for drivers
      const isDriver = user?.role === 'driver';
      triggerPushNotification(`SkyDrive: ${type.replace(/_/g, ' ')}`, data.message, isDriver);
    };

    socket.on("notification", handleNotification);
    return () => {
      socket.off("notification", handleNotification);
    };
  }, [user]);

  const [view, setView] = useState<View>('user');

  useEffect(() => {
    // View change handling
  }, [view]);

  const [trackingId, setTrackingId] = useState('');
  const [trackedRide, setTrackedRide] = useState<Ride | null>(null);
  const [bookingData, setBookingData] = useState({ 
    pickup: '', 
    dropoff: '', 
    tripType: 'single' as 'single' | 'round',
    manualDistance: '',
    passengers: '1',
    pickupDate: new Date().toISOString().split('T')[0],
    pickupTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  });
  const [isManualDetailedAddress, setIsManualDetailedAddress] = useState(false);
  const [showManualFormOption, setShowManualFormOption] = useState(false);
  const [pickupDetailed, setPickupDetailed] = useState({
    street: '',
    city: '',
    district: '',
    state: ''
  });
  const [dropoffDetailed, setDropoffDetailed] = useState({
    street: '',
    city: '',
    district: '',
    state: ''
  });
  const [isLiveLocationLoading, setIsLiveLocationLoading] = useState(false);
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropoffRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isManualDetailedAddress) {
      const partsPickup = [pickupDetailed.street, pickupDetailed.city, pickupDetailed.district, pickupDetailed.state].filter(p => p && p.trim() !== '');
      const partsDropoff = [dropoffDetailed.street, dropoffDetailed.city, dropoffDetailed.district, dropoffDetailed.state].filter(p => p && p.trim() !== '');
      setBookingData(prev => ({
        ...prev,
        pickup: partsPickup.join(', '),
        dropoff: partsDropoff.join(', ')
      }));
    }
  }, [isManualDetailedAddress, pickupDetailed, dropoffDetailed]);
  const [fareOptions, setFareOptions] = useState<any[]>([]);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [error, setError] = useState('');

  // User Auth States
  const [userAuthMode, setUserAuthMode] = useState<'login' | 'register'>('login');
  const [userLoginData, setUserLoginData] = useState({ phone: '', name: '', password: '', dob: '' });
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);

  // Driver Auth States
  const [driverAuthMode, setDriverAuthMode] = useState<'login' | 'register'>('login');
  const [loginData, setLoginData] = useState({ 
    phone: '', 
    name: '', 
    username: '', 
    password: '',
    dob: '',
    vehicle_number: '',
    vehicle_type: 'Sedan (AC)',
    vehicle_seats: '4',
    vehicle_category: 'commercial'
  });

  // Admin Data
  const [adminLoginStep, setAdminLoginStep] = useState<'credentials' | 'pin'>('credentials');
  const [tempAdminId, setTempAdminId] = useState<string | null>(null);
  const [adminPin, setAdminPin] = useState('');
  const [finalAmountInput, setFinalAmountInput] = useState('');
  const [adminRides, setAdminRides] = useState<Ride[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeNotification, setActiveNotification] = useState<Notification | null>(null);
  const [sessionDismissed, setSessionDismissed] = useState<string[]>([]);
  const [newNotification, setNewNotification] = useState({
    message: '',
    target: 'all_drivers' as Notification['target'],
    driver_id: '',
    user_id: ''
  });
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [adminDrivers, setAdminDrivers] = useState<any[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminVehicles, setAdminVehicles] = useState<any[]>([]);
  const [otherAdmins, setOtherAdmins] = useState<AdminUser[]>([]);
  const [adminWithdrawals, setAdminWithdrawals] = useState<any[]>([]);
  const [selectedDriverTransactions, setSelectedDriverTransactions] = useState<{name: string, transactions: any[]} | null>(null);
  const [newAdmin, setNewAdmin] = useState({ 
    username: '', 
    password: '', 
    pin: '', 
    role: 'admin' as 'admin' | 'owner',
    permissions: {
      rides: true,
      drivers: true,
      users: true,
      withdrawals: true,
      notifications: true
    }
  });
  const [changeCreds, setChangeCreds] = useState({ password: '', pin: '' });
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | any | null>(null);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editingDriver, setEditingDriver] = useState<any | null>(null);
  const [isManualRideModalOpen, setIsManualRideModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCategory, setSearchCategory] = useState('all');
  const [selectedRides, setSelectedRides] = useState<string[]>([]);
  const [isRidesBulkDeleteEnabled, setIsRidesBulkDeleteEnabled] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [isTransactionsBulkDeleteEnabled, setIsTransactionsBulkDeleteEnabled] = useState(false);
  const [isForgotPasswordModalOpen, setIsForgotPasswordModalOpen] = useState(false);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [useFreeRide, setUseFreeRide] = useState(false);
  const [configStatus, setConfigStatus] = useState<any>(null);
  const [memoryInfo, setMemoryInfo] = useState<any>(null);

  const fetchConfigStatus = async (retries = 5) => {
    try {
      console.log(`[${new Date().toISOString()}] Fetching config status...`);
      const response = await fetch('/api/config/status');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Config status fetched successfully:', data);
      setConfigStatus(data);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch config status:`, err);
      if (retries > 0) {
        const delay = (6 - retries) * 1000; // Exponential-ish backoff
        console.log(`Retrying config status fetch in ${delay}ms... (${retries} attempts left)`);
        setTimeout(() => fetchConfigStatus(retries - 1), delay);
      }
    }
  };

  const fetchMemoryInfo = async (retries = 5) => {
    if (user?.role !== 'owner') return;
    try {
      console.log(`[${new Date().toISOString()}] Fetching memory info...`);
      const response = await fetch('/api/system/memory');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      console.log('Memory info fetched successfully:', data);
      setMemoryInfo(data);
    } catch (err: any) {
      console.error(`[${new Date().toISOString()}] Failed to fetch memory info:`, err);
      if (retries > 0) {
        const delay = (6 - retries) * 1000;
        console.log(`Retrying memory info fetch in ${delay}ms... (${retries} attempts left)`);
        setTimeout(() => fetchMemoryInfo(retries - 1), delay);
      }
    }
  };

  useEffect(() => {
    // Validate Connection to Firestore
    const testConnection = async () => {
      try {
        console.log("Testing Firestore connection from frontend...");
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection successful from frontend.");
      } catch (error) {
        if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
          console.error("Firestore connection failure: Device might be offline or Cloud Firestore backend is unreachable.", error);
        } else {
          console.error("Firestore test connection error:", error);
        }
      }
    };
    testConnection();
    fetchConfigStatus();
  }, []);

  useEffect(() => {
    if (user?.role === 'owner') {
      fetchMemoryInfo();
      const interval = setInterval(fetchMemoryInfo, 30000); // Update every 30 seconds
      return () => clearInterval(interval);
    }
  }, [user]);
  const [forgotPasswordType, setForgotPasswordType] = useState<'user' | 'driver'>('user');
  const [cancellationModal, setCancellationModal] = useState<{ rideId: string, type: 'user' | 'driver' } | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [forgotPasswordData, setForgotPasswordData] = useState({ phone: '', dob: '', newPassword: '' });
  const [editingNotification, setEditingNotification] = useState<Notification | null>(null);
  const [isEditingNotificationModalOpen, setIsEditingNotificationModalOpen] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState<Notification[]>([]);
  const [manualRideData, setManualRideData] = useState({
    pickup_location: '',
    dropoff_location: '',
    fare: '',
    user_name: '',
    user_phone: '',
    driver_id: '',
    status: 'pending' as Ride['status'],
    trip_type: 'single' as Ride['trip_type'],
    distance: '',
    vehicle_type: 'Sedan (AC)',
    passengers: '1'
  });

  const [activities, setActivities] = useState<any[]>([]);
  const [reviewModal, setReviewModal] = useState<{ rideId: string, driverName: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewMessage, setReviewMessage] = useState('');
  const [complaintModal, setComplaintModal] = useState<{ rideId: string, trackingId: string, driverPhone?: string } | null>(null);
  const [complaintMessage, setComplaintMessage] = useState('');
  const [complaintReplyModal, setComplaintReplyModal] = useState<{ rideId: string, complaint: string, driverId?: string, userPhone?: string, driverPhone?: string } | null>(null);
  const [complaintUserReply, setComplaintUserReply] = useState('');
  const [complaintDriverReply, setComplaintDriverReply] = useState('');
  const [forwardToDriver, setForwardToDriver] = useState(false);
  const [forwardToAdminId, setForwardToAdminId] = useState<string>('');

  // Driver Data
  const [driverRidesTab, setDriverRidesTab] = useState<'all' | 'available' | 'accepted' | 'completed'>('all');
  const [availableRides, setAvailableRides] = useState<Ride[]>([]);
  const [driverWallet, setDriverWallet] = useState({ balance: 0, transactions: [] });
  const [driverWithdrawals, setDriverWithdrawals] = useState<any[]>([]);
  const [otpInput, setOtpInput] = useState('');
  const [actualKmInput, setActualKmInput] = useState('');
  const [etaInput, setEtaInput] = useState('');
  const [acceptingRideId, setAcceptingRideId] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error', persistent?: boolean } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(true);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [trackedPickupCoords, setTrackedPickupCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [trackedDropoffCoords, setTrackedDropoffCoords] = useState<{ lat: number, lng: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Preload notification sound
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
    audioRef.current.loop = true;

    // Global click listener to ensure audio context is unlocked
    const handleFirstInteraction = () => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current?.pause();
          audioRef.current!.currentTime = 0;
          window.removeEventListener('click', handleFirstInteraction);
          window.removeEventListener('touchstart', handleFirstInteraction);
        }).catch(e => console.log('Silent unlock failed:', e));
      }
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // Find and set active notification
  useEffect(() => {
    if (!user || !notifications.length) return;
    
    const latest = notifications.find(n => {
      // If dismissed in this session, don't show again until reload
      if (sessionDismissed.includes(n.id)) return false;

      const seenInfo = n.seen_by?.find(s => s.userId === user.id);
      
      // If seen, check if it's within 24 hours
      if (seenInfo) {
        const seenAt = new Date(seenInfo.seenAt).getTime();
        const now = new Date().getTime();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        // If more than 24 hours have passed since it was seen, hide it
        if (now - seenAt > twentyFourHours) return false;
        
        // If within 24 hours, it should still show on app open
        return true;
      }

      // If not seen yet, show it
      const isRead = n.read_by?.includes(user.id);
      if (isRead) return false;

      // Extra client-side check for specific driver
      if (n.target === 'specific_driver' && n.driver_id !== user.id) return false;
      
      // Extra client-side check for specific user
      if (n.target === 'specific_user' && n.user_id !== user.id) return false;

      // Extra client-side check for specific admin
      if (n.target === 'specific_admin' && n.admin_id !== user.id) return false;
      
      return true;
    });

    if (latest && (!activeNotification || activeNotification.id !== latest.id)) {
      setActiveNotification(latest);
    }
  }, [notifications, sessionDismissed, user]);

  const stopRing = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    if (toast && !toast.persistent) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    // Load Google Maps Script
    const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
    
    // Global error handler for Google Maps authentication failures
    (window as any).gm_authFailure = () => {
      console.error("Google Maps authentication failed. Check your API key.");
      setToast({ message: "Google Maps authentication failed. Check your API key.", type: 'error' });
    };

    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      console.warn("Google Maps API Key is missing. Using Gemini AI fallback for distance calculations.");
      return;
    }

    const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (!window.google && !existingScript) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initAutocomplete();
      };
      script.onerror = () => {
        console.error("Failed to load Google Maps script. Check your API key and internet connection.");
        setToast({ message: "Failed to load Google Maps. Please check your API key.", type: 'error' });
      };
      document.head.appendChild(script);
    } else if (window.google) {
      initAutocomplete();
    }
  }, []);

  // User document listener to keep status updated
  useEffect(() => {
    if (!user?.id || !isAuthReady) return;
    
    const collectionName = user.role === 'admin' || user.role === 'owner' ? 'admins' : 
                          user.role === 'driver' ? 'drivers' : 'users';
    
    const unsubscribe = onSnapshot(doc(db, collectionName, user.id), (snapshot) => {
      if (snapshot.exists()) {
        const updatedUser = { ...snapshot.data(), id: snapshot.id, role: user.role };
        setUser(updatedUser);
      }
    });

    return () => unsubscribe();
  }, [user?.id, isAuthReady]);

  // Monthly Maintenance Fee Deduction for Drivers
  useEffect(() => {
    const checkMaintenanceFee = async () => {
      if (user?.role === 'driver' && user.id) {
        // Initialize last_maintenance_deduction if missing
        if (!user.last_maintenance_deduction) {
          try {
            const driverRef = doc(db, 'drivers', user.id);
            await updateDoc(driverRef, {
              last_maintenance_deduction: user.created_at || new Date().toISOString()
            });
            return; // Snapshot listener will trigger re-run with the new value
          } catch (err) {
            console.error("Error initializing maintenance date:", err);
            return;
          }
        }

        const lastDeduction = new Date(user.last_maintenance_deduction);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastDeduction.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 30) {
          try {
            await runTransaction(db, async (transaction) => {
              const driverRef = doc(db, 'drivers', user.id);
              const driverSnap = await transaction.get(driverRef);
              
              if (!driverSnap.exists()) return;
              
              const currentBalance = driverSnap.data().wallet_balance || 0;
              const fee = 87;
              const newBalance = currentBalance - fee;
              const nextDeductionDate = new Date().toISOString();

              transaction.update(driverRef, {
                wallet_balance: newBalance,
                last_maintenance_deduction: nextDeductionDate,
                monthly_fee_status: 'done'
              });

              const txRef = doc(collection(db, 'transactions'));
              transaction.set(txRef, {
                id: txRef.id,
                driver_id: user.id,
                amount: fee,
                type: 'debit',
                description: 'Platform maintenance + Unlimited Trips Access fee',
                created_at: nextDeductionDate
              });
            });
            
            setToast({ 
              message: 'Monthly maintenance fee of ₹87 deducted from your wallet.', 
              type: 'success' 
            });
          } catch (err) {
            console.error("Maintenance fee deduction error:", err);
          }
        }
      }
    };

    if (isAuthReady && user?.role === 'driver') {
      checkMaintenanceFee();
    }
  }, [user?.id, user?.last_maintenance_deduction, isAuthReady]);

  // WebSocket Connection

  // Real-time listeners
  useEffect(() => {
    if (!user || !isAuthReady) return;

    let unsubscribeRides: () => void;
    let unsubscribeAvailable: () => void;
    let unsubscribeWithdrawals: () => void;
    let unsubscribeDrivers: () => void;
    let unsubscribeVehicles: () => void;
    let unsubscribeAllRides: () => void;
    let unsubscribeNotifications: () => void;
    let unsubscribeUsers: () => void;
    let unsubscribeDriverData: () => void;
    let unsubscribeDriverTransactions: () => void;
    let unsubscribeAdmins: () => void;
    let unsubscribeActivities: () => void;

    // Notification Listener for all views
    let notifQuery;
    if (view === 'admin') {
      notifQuery = query(
        collection(db, 'notifications'),
        orderBy('created_at', 'desc'),
        limit(200)
      );
    } else if (view === 'driver') {
      notifQuery = query(
        collection(db, 'notifications'),
        where('target', 'in', ['all_drivers', 'specific_driver']),
        orderBy('created_at', 'desc'),
        limit(100)
      );
    } else {
      notifQuery = query(
        collection(db, 'notifications'),
        where('target', 'in', ['all_users', 'specific_user']),
        orderBy('created_at', 'desc'),
        limit(100)
      );
    }

    unsubscribeNotifications = onSnapshot(notifQuery, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Notification));
      setNotifications(notifs);
      if (view === 'admin') {
        setAdminNotifications(notifs);
      }
    }, (err) => {
      // If query fails (e.g. specific_driver query needs index or permission issue)
      console.error("Notification query error:", err);
    });

    if (view === 'user') {
      const q = query(
        collection(db, 'rides'), 
        where('user_id', '==', user.id),
        orderBy('created_at', 'desc')
      );
      unsubscribeRides = onSnapshot(q, (snapshot) => {
        const rides = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Ride));
        setMyRides(rides);
        
        // Update tracked ride if it's in the snapshot
        if (trackedRide) {
          const updated = rides.find(r => r.id === trackedRide.id);
          if (updated) setTrackedRide(updated);
        }
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'rides'));

      // User Data Listener (for wallet and free rides)
      const userRef = doc(db, 'users', user.id);
      const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUser(prev => ({ ...prev, ...data }));
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.id}`));
      
      // Cleanup
      return () => {
        unsubscribeRides();
        unsubscribeUser();
      };
    }

    if (view === 'driver') {
      const q = query(
        collection(db, 'rides'),
        orderBy('created_at', 'desc'),
        limit(1000)
      );
      unsubscribeAvailable = onSnapshot(q, (snapshot) => {
        const rides = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Ride));
        
        // Check for new pending rides to play sound
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const newRide = change.doc.data() as Ride;
            if (newRide.status === 'pending') {
              if (isAudioUnlocked && audioRef.current) {
                audioRef.current.play().catch(e => console.log('Audio play failed:', e));
                setTimeout(stopRing, 60000);
              }
              setToast({ message: "New Ride Request Available!", type: 'success' });
            }
          }
        });

        setAvailableRides(rides);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'rides'));

      // Driver Wallet & Transactions Listener
      unsubscribeDriverData = onSnapshot(doc(db, 'drivers', user.id), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDriverWallet(prev => ({ ...prev, balance: data.wallet_balance || 0 }));
        }
      }, (err) => handleFirestoreError(err, OperationType.GET, `drivers/${user.id}`));

      const txQuery = query(
        collection(db, 'transactions'),
        where('driver_id', '==', user.id),
        orderBy('created_at', 'desc'),
        limit(500)
      );
      unsubscribeDriverTransactions = onSnapshot(txQuery, (snapshot) => {
        const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setDriverWallet(prev => ({ ...prev, transactions: txs }));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));
    }

    let cleanupInterval: any;
    if (view === 'admin') {
      unsubscribeWithdrawals = onSnapshot(collection(db, 'withdrawal_requests'), (snapshot) => {
        const requests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setAdminWithdrawals(requests);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'withdrawal_requests'));

      unsubscribeDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
        const drivers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setAdminDrivers(drivers);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'drivers'));

      unsubscribeVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
        const vehicles = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setAdminVehicles(vehicles);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'vehicles'));

      unsubscribeAllRides = onSnapshot(query(collection(db, 'rides'), orderBy('created_at', 'desc'), limit(1000)), (snapshot) => {
        const rides = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Ride));
        setAdminRides(rides);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'rides'));

      unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        setAdminUsers(users);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

      // Only owner can see other admins
      if (user.role === 'owner') {
        unsubscribeAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
          const admins = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AdminUser));
          // Shafiq Choudhary's profile should not be visible to any other owner
          if (user.username !== 'Shafiq Choudhary') {
            setOtherAdmins(admins.filter(a => a.username !== 'Shafiq Choudhary'));
          } else {
            setOtherAdmins(admins);
          }
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'admins'));

        const qActivities = query(collection(db, 'activities'), orderBy('timestamp', 'desc'), limit(100));
        unsubscribeActivities = onSnapshot(qActivities, (snapshot) => {
          const acts = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          // Shafiq Choudhary's activities should not be visible to any other owner
          if (user.username !== 'Shafiq Choudhary') {
            setActivities(acts.filter((a: any) => a.admin_name !== 'Shafiq Choudhary'));
          } else {
            setActivities(acts);
          }
        }, (err) => handleFirestoreError(err, OperationType.LIST, 'activities'));
      }
    }

    return () => {
      if (cleanupInterval) clearInterval(cleanupInterval);
      unsubscribeRides?.();
      unsubscribeAvailable?.();
      unsubscribeWithdrawals?.();
      unsubscribeDrivers?.();
      unsubscribeVehicles?.();
      unsubscribeAllRides?.();
      unsubscribeNotifications?.();
      unsubscribeDriverData?.();
      unsubscribeDriverTransactions?.();
      unsubscribeAdmins?.();
      unsubscribeUsers?.();
      unsubscribeActivities?.();
    };
  }, [view, user, isAuthReady]);

  const fetchUserRides = () => {};

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);
    try {
      const q = query(
        collection(db, 'users'), 
        where('phone', '==', userLoginData.phone), 
        where('password', '==', userLoginData.password),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const userData = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id, role: 'user' };
        
        // Update last active
        await updateDoc(doc(db, 'users', userData.id), {
          last_active: new Date().toISOString()
        });
        
        setUser(userData);
        localStorage.setItem('skydrive_auth', JSON.stringify(userData));
        setToast({ message: 'Login successful!', type: 'success' });
        
        // Auto-subscribe to notifications
        subscribeToPushNotifications();
      } else {
        setError('Invalid phone number or password');
      }
    } catch (err: any) {
      console.error("User Login Error:", err);
      setError(err.message || 'Login failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUserRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userLoginData.name || !userLoginData.phone || !userLoginData.password) {
      setError('Please fill all fields');
      return;
    }
    setError('');
    setIsVerifying(true);
    try {
      // Check if phone exists in users
      const qUser = query(collection(db, 'users'), where('phone', '==', userLoginData.phone), limit(1));
      const snapshotUser = await getDocs(qUser);
      if (!snapshotUser.empty) {
        setError('User with this phone already exists');
        return;
      }

      // Check if phone exists in drivers
      const qDriver = query(collection(db, 'drivers'), where('phone', '==', userLoginData.phone), limit(1));
      const snapshotDriver = await getDocs(qDriver);
      if (!snapshotDriver.empty) {
        setError('This phone is already registered as a Driver. You cannot have both profiles.');
        return;
      }

      const data = {
        name: userLoginData.name,
        phone: userLoginData.phone,
        password: userLoginData.password,
        dob: userLoginData.dob,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
        role: 'user',
        consecutive_cancellations: 0,
        wallet_balance: 0,
        free_rides: 0
      };

      const docRef = await addDoc(collection(db, 'users'), data);
      const userData = { ...data, id: docRef.id };
      setUser(userData);
      localStorage.setItem('skydrive_auth', JSON.stringify(userData));
      setToast({ message: 'Registration successful!', type: 'success' });
      
      // Auto-subscribe to notifications
      subscribeToPushNotifications();
    } catch (err: any) {
      console.error("User Registration Error:", err);
      setError(err.message || 'Registration failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUserCancelRide = async (rideId: string) => {
    setCancellationModal({ rideId, type: 'user' });
  };

  const handleConfirmCancellation = async () => {
    if (!cancellationModal || !cancellationReason.trim()) {
      setToast({ message: 'Please provide a reason for cancellation', type: 'error' });
      return;
    }

    const { rideId, type } = cancellationModal;
    setIsActionLoading(true);

    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      if (!rideSnap.exists()) {
        setToast({ message: 'Ride not found', type: 'error' });
        return;
      }
      const rideData = rideSnap.data();

      if (type === 'user') {
        await updateDoc(rideRef, { 
          status: 'cancelled',
          cancellation_reason: cancellationReason
        });

        // Increment consecutive cancellations for the user
        if (user?.id) {
          const userRef = doc(db, 'users', user.id);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const currentCancellations = userSnap.data().consecutive_cancellations || 0;
            const nextCancellations = currentCancellations + 1;
            await updateDoc(userRef, { consecutive_cancellations: nextCancellations });
            setUser(prev => prev ? { ...prev, consecutive_cancellations: nextCancellations } : null);
          }
        }

        sendNotification('RIDE_CANCELLED', {
          message: `Ride ${rideData?.tracking_id} has been cancelled by the user. Reason: ${cancellationReason}`,
          phone: rideData?.user_phone
        });

        await addDoc(collection(db, 'notifications'), {
          message: `Ride ${rideData?.tracking_id} cancelled by user. Reason: ${cancellationReason}`,
          target: 'admin_alert',
          created_at: new Date().toISOString(),
          read_by: [],
          seen_by: []
        });

        setToast({ message: "Ride Cancelled", type: 'success' });
      } else {
        // Driver cancellation
        const driverId = rideData.driver_id;
        if (!driverId) {
          setToast({ message: 'No driver assigned to this ride', type: 'error' });
          return;
        }

        // Reset the ride to pending
        await updateDoc(rideRef, {
          status: 'pending',
          driver_id: null,
          accepted_at: null,
          eta: null,
          start_otp: null,
          end_otp: null,
          cancellation_reason: `Driver (${user?.name}): ${cancellationReason}`
        });

        sendNotification('RIDE_DRIVER_CANCELLED', {
          message: `Driver ${user?.name} has cancelled the ride ${rideData?.tracking_id}. Reason: ${cancellationReason}. The ride is now back to pending status.`,
          phone: rideData?.user_phone
        });

        // Fine the driver
        const driverRef = doc(db, 'drivers', driverId);
        const driverSnap = await getDoc(driverRef);
        if (driverSnap.exists()) {
          const currentBalance = driverSnap.data().wallet_balance || 0;
          const newBalance = currentBalance - 50;
          await updateDoc(driverRef, { wallet_balance: newBalance });
          await addDoc(collection(db, 'transactions'), {
            driver_id: driverId,
            amount: 50,
            type: 'debit',
            description: `Cancellation Fine (Ride ID: ${rideData.tracking_id || rideId}). Reason: ${cancellationReason}`,
            created_at: new Date().toISOString()
          });
          setToast({ message: 'Ride cancelled successfully.', type: 'success' });
        }
      }

      setCancellationModal(null);
      setCancellationReason('');
    } catch (err) {
      console.error("Cancellation error:", err);
      handleFirestoreError(err, OperationType.UPDATE, `rides/${rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!reviewModal) return;
    setIsActionLoading(true);
    try {
      const rideRef = doc(db, 'rides', reviewModal.rideId);
      await updateDoc(rideRef, {
        rating: rating,
        review: reviewMessage
      });
      setToast({ message: "Review submitted successfully", type: 'success' });
      setReviewModal(null);
      setRating(5);
      setReviewMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${reviewModal.rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSubmitComplaint = async () => {
    if (!complaintModal) return;
    if (!complaintMessage.trim()) {
      setToast({ message: "Please enter your complaint message", type: 'error' });
      return;
    }

    // Check if user has any existing unresolved complaint
    const hasUnresolvedComplaint = myRides.some(ride => 
      ride.complaint && (ride.complaint_status === 'pending' || ride.complaint_status === 'forwarded')
    );

    if (hasUnresolvedComplaint) {
      setToast({ 
        message: "You already have an active complaint. Please wait for it to be resolved before filing a new one.", 
        type: 'error' 
      });
      return;
    }

    setIsActionLoading(true);
    try {
      const rideRef = doc(db, 'rides', complaintModal.rideId);
      await updateDoc(rideRef, {
        complaint: complaintMessage,
        complaint_status: 'pending',
        complaint_user_phone: user.phone || '---',
        complaint_driver_phone: complaintModal.driverPhone || '---'
      });
      setToast({ message: "Complaint submitted successfully. Admin will review it.", type: 'success' });
      setComplaintModal(null);
      setComplaintMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${complaintModal.rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const fetchAdminData = () => {};
  const fetchOtherAdmins = () => {};

  const handleUpdateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    // Protection for Shafiq Choudhary: No other owner can update his profile
    if (editingAdmin.username === 'Shafiq Choudhary' && user.username !== 'Shafiq Choudhary') {
      setToast({ message: 'You do not have permission to update this profile', type: 'error' });
      return;
    }

    try {
      const adminRef = doc(db, 'admins', editingAdmin.id);
      await updateDoc(adminRef, {
        username: editingAdmin.username,
        password: editingAdmin.password,
        pin: editingAdmin.pin,
        permissions: editingAdmin.permissions
      });
      await logActivity('Update Admin', `Admin: ${editingAdmin.username}`, editingAdmin.id, 'admin');
      setToast({ message: "Admin Updated", type: 'success' });
      setEditingAdmin(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `admins/${editingAdmin.id}`);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const userRef = doc(db, 'users', editingUser.id);
      await updateDoc(userRef, {
        name: editingUser.name,
        phone: editingUser.phone,
        password: editingUser.password
      });
      await logActivity('Update User', `User: ${editingUser.name} (${editingUser.phone})`, editingUser.id, 'user');
      setToast({ message: "User Updated", type: 'success' });
      setEditingUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.id}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this user? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          await logActivity('Delete User', `User ID: ${userId}`, userId, 'user');
          setToast({ message: 'User deleted successfully', type: 'success' });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
        }
        setConfirmModal(null);
      }
    });
  };

  const handleDeleteDriver = async (driverId: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this driver? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'drivers', driverId));
          await logActivity('Delete Driver', `Driver ID: ${driverId}`, driverId, 'driver');
          // Also delete associated vehicle if exists
          const vq = query(collection(db, 'vehicles'), where('driver_id', '==', driverId));
          const vSnap = await getDocs(vq);
          vSnap.forEach(async (vDoc) => {
            await deleteDoc(doc(db, 'vehicles', vDoc.id));
          });
          setToast({ message: 'Driver deleted successfully', type: 'success' });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `drivers/${driverId}`);
        }
        setConfirmModal(null);
      }
    });
  };

  const handleDeleteWithdrawal = async (requestId: string) => {
    setConfirmModal({
      message: 'Are you sure you want to delete this withdrawal request?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'withdrawal_requests', requestId));
          await logActivity('Delete Withdrawal Request', `Request ID: ${requestId}`, requestId, 'withdrawal');
          setToast({ message: 'Withdrawal request deleted successfully', type: 'success' });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `withdrawal_requests/${requestId}`);
        }
        setConfirmModal(null);
      }
    });
  };

  const handleDeleteAdmin = async (adminId: string) => {
    // Protection for Shafiq Choudhary: No other owner can delete his profile
    const adminToDelete = otherAdmins.find(a => a.id === adminId);
    if (adminToDelete?.username === 'Shafiq Choudhary' && user.username !== 'Shafiq Choudhary') {
      setToast({ message: 'You do not have permission to delete this profile', type: 'error' });
      return;
    }

    if (adminId === user.id) {
      setToast({ message: 'You cannot delete your own profile', type: 'error' });
      return;
    }
    setConfirmModal({
      message: 'Are you sure you want to delete this admin profile?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'admins', adminId));
          await logActivity('Delete Admin', `Admin ID: ${adminId}`, adminId, 'admin');
          setToast({ message: 'Admin profile deleted successfully', type: 'success' });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `admins/${adminId}`);
        }
        setConfirmModal(null);
      }
    });
  };

  const handleUpdateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    try {
      const driverRef = doc(db, 'drivers', editingDriver.id);
      await updateDoc(driverRef, {
        name: editingDriver.name,
        phone: editingDriver.phone,
        password: editingDriver.password,
        pin: editingDriver.pin,
        vehicle_number: editingDriver.vehicle_number,
        vehicle_type: editingDriver.vehicle_type,
        vehicle_seats: parseInt(editingDriver.vehicle_seats),
        vehicle_category: editingDriver.vehicle_category
      });
      await logActivity('Update Driver', `Driver: ${editingDriver.name} (${editingDriver.phone})`, editingDriver.id, 'driver');
      setToast({ message: "Driver Updated", type: 'success' });
      setEditingDriver(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${editingDriver.id}`);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user.role !== 'owner') {
      setToast({ message: "Only owners can manage admins!", type: 'error' });
      return;
    }
    // Only Shafiq Choudhary can create another owner
    if (newAdmin.role === 'owner' && user.username !== 'Shafiq Choudhary') {
      setToast({ message: "Only Shafiq Choudhary can create another owner!", type: 'error' });
      return;
    }
    try {
      const docRef = await addDoc(collection(db, 'admins'), {
        username: newAdmin.username,
        password: newAdmin.password,
        pin: newAdmin.pin,
        role: newAdmin.role,
        permissions: newAdmin.permissions,
        created_at: new Date().toISOString()
      });
      await logActivity('Add Admin', `Username: ${newAdmin.username} (Role: ${newAdmin.role})`, docRef.id, 'admin');
      setNewAdmin({ 
        username: '', 
        password: '', 
        pin: '', 
        role: 'admin',
        permissions: {
          rides: true,
          drivers: true,
          users: true,
          withdrawals: true,
          notifications: true
        }
      });
      setToast({ message: `${newAdmin.role.charAt(0).toUpperCase() + newAdmin.role.slice(1)} Added Successfully`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'admins');
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotification.message) return;
    setIsSendingNotification(true);
    try {
      const docRef = await addDoc(collection(db, 'notifications'), {
        ...newNotification,
        created_at: new Date().toISOString(),
        read_by: [],
        seen_by: []
      });
      
      // Log activity
      await logActivity('Send Notification', `Target: ${newNotification.target}, Message: ${newNotification.message.substring(0, 50)}...`, docRef.id, 'notification');

      setNewNotification({ message: '', target: 'all_drivers', driver_id: '', user_id: '' });
      setToast({ message: 'Notification sent successfully!', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    if (!user) return;
    try {
      // Add to session dismissed list so it doesn't pop up again until reload
      setSessionDismissed(prev => [...prev, notificationId]);
      
      const notifRef = doc(db, 'notifications', notificationId);
      const notif = notifications.find(n => n.id === notificationId);
      
      if (notif) {
        const alreadySeen = notif.seen_by?.some(s => s.userId === user.id);
        
        if (!alreadySeen) {
          // Record first seen time
          await updateDoc(notifRef, {
            seen_by: arrayUnion({
              userId: user.id,
              seenAt: new Date().toISOString()
            })
          });
        }
      }

      setActiveNotification(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notificationId}`);
    }
  };

  const handleWalletAdjust = async (driverId: string, amount: number, type: 'credit' | 'debit') => {
    if (isNaN(amount) || amount <= 0) {
      setToast({ message: 'Please enter a valid amount', type: 'error' });
      return;
    }

    const reason = prompt(`Enter reason for ${type}:`);
    if (reason === null) return;
    if (reason.trim() === '') {
      setToast({ message: 'Reason is required', type: 'error' });
      return;
    }

    try {
      const driverRef = doc(db, 'drivers', driverId);
      const driverSnap = await getDoc(driverRef);
      if (driverSnap.exists()) {
        const currentBalance = driverSnap.data().wallet_balance || 0;
        const newBalance = Number((type === 'credit' ? currentBalance + amount : currentBalance - amount).toFixed(2));
        await updateDoc(driverRef, { wallet_balance: newBalance });
        
        await logActivity('Wallet Adjust', `${type === 'credit' ? 'Credit' : 'Debit'} ₹${amount.toFixed(2)} to Driver ID: ${driverId}. Reason: ${reason}`, driverId, 'driver');

        await addDoc(collection(db, 'transactions'), {
          driver_id: driverId,
          amount: Number(amount.toFixed(2)),
          type,
          description: reason,
          created_at: new Date().toISOString()
        });
        setToast({ message: `Wallet ${type === 'credit' ? 'credited' : 'debited'} successfully`, type: 'success' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
    }
  };

  const handleManualFeeClear = async (driverId: string, driverName: string) => {
    const fee = 87;
    const confirmed = window.confirm(`Clear Monthly Fee for ${driverName}? This will deduct ₹${fee} from their wallet and set status to DONE.`);
    if (!confirmed) return;

    try {
      await runTransaction(db, async (transaction) => {
        const driverRef = doc(db, 'drivers', driverId);
        const driverSnap = await transaction.get(driverRef);
        
        if (!driverSnap.exists()) return;
        
        const currentBalance = driverSnap.data().wallet_balance || 0;
        const newBalance = Number((currentBalance - fee).toFixed(2));
        const nextDeductionDate = new Date().toISOString();

        transaction.update(driverRef, {
          wallet_balance: newBalance,
          last_maintenance_deduction: nextDeductionDate,
          monthly_fee_status: 'done'
        });

        const txRef = doc(collection(db, 'transactions'));
        transaction.set(txRef, {
          id: txRef.id,
          driver_id: driverId,
          amount: fee,
          type: 'debit',
          description: 'Manual Monthly Fee collection by Admin',
          created_at: nextDeductionDate
        });
      });
      
      await logActivity('Fee Collection', `Manually collected monthly fee of ₹${fee} from ${driverName}`, driverId, 'driver');
      setToast({ message: 'Monthly fee cleared manually.', type: 'success' });
    } catch (err) {
      console.error("Manual fee collection error:", err);
      setToast({ message: 'Failed to clear fee.', type: 'error' });
    }
  };

  const handleDeleteRide = async (rideId: string) => {
    if (user.role !== 'owner') return;
    
    setConfirmModal({
      message: "Are you sure you want to permanently delete this ride record? This action cannot be undone and is intended for database maintenance.",
      onConfirm: async () => {
        setIsActionLoading(true);
        try {
          await deleteDoc(doc(db, 'rides', rideId));
          await logActivity('Delete Ride', `Ride ID: ${rideId}`, rideId, 'ride');
          setToast({ message: "Ride record deleted successfully", type: 'success' });
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `rides/${rideId}`);
        } finally {
          setIsActionLoading(false);
        }
      }
    });
  };

  const handleResolveComplaint = async (rideId: string) => {
    try {
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, {
        complaint_status: 'resolved'
      });
      await logActivity('Resolve Complaint', `Ride ID: ${rideId}`, rideId, 'ride');
      setToast({ message: "Complaint marked as resolved", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${rideId}`);
    }
  };

  const handleSendComplaintReply = async (shouldResolve: boolean = true) => {
    if (!complaintReplyModal) return;
    if (shouldResolve && !complaintUserReply.trim()) {
      setToast({ message: "Please enter a reply for the user", type: 'error' });
      return;
    }

    setIsActionLoading(true);
    try {
      const rideRef = doc(db, 'rides', complaintReplyModal.rideId);
      const updateData: any = {
        complaint_user_reply: complaintUserReply,
        complaint_driver_reply: complaintDriverReply,
        complaint_reply: complaintUserReply, // General resolution message
        complaint_admin_name: user.name || user.username || 'Admin'
      };

      if (shouldResolve) {
        updateData.complaint_status = 'resolved';
      } else {
        updateData.complaint_status = 'forwarded';
      }

      if (forwardToDriver) {
        updateData.complaint_forwarded_to_driver = true;
      }

      if (forwardToAdminId) {
        updateData.complaint_forwarded_to_admin_id = forwardToAdminId;
        const admin = otherAdmins.find(a => a.id === forwardToAdminId);
        if (admin) {
          updateData.complaint_forwarded_to_admin_name = admin.username;
        }
      }

      await updateDoc(rideRef, updateData);
      await logActivity('Complaint Reply', `Ride ID: ${complaintReplyModal.rideId}, Action: ${shouldResolve ? 'Resolved' : 'Forwarded'}`, complaintReplyModal.rideId, 'ride');

      // If forwarded to another admin, send a notification
      if (forwardToAdminId) {
        await addDoc(collection(db, 'notifications'), {
          message: `Forwarded Complaint: ${complaintUserReply || 'A complaint has been forwarded to you.'}`,
          target: 'specific_admin',
          admin_id: forwardToAdminId,
          created_at: new Date().toISOString(),
          read_by: [],
          seen_by: []
        });
      }

      // If forwarded to driver, send notification to driver
      if (forwardToDriver && complaintReplyModal.driverId) {
        await addDoc(collection(db, 'notifications'), {
          message: `Complaint Update: ${complaintDriverReply || 'A complaint has been forwarded to you.'}`,
          target: 'specific_driver',
          driver_id: complaintReplyModal.driverId,
          created_at: new Date().toISOString(),
          read_by: [],
          seen_by: []
        });
      }

      // Notification to user about complaint status
      if (shouldResolve || forwardToAdminId || forwardToDriver) {
        const rideDoc = await getDoc(rideRef);
        const rideData = rideDoc.data() as Ride;
        if (rideData.user_id) {
          await addDoc(collection(db, 'notifications'), {
            message: `Complaint Status: ${shouldResolve ? 'Resolved' : 'Forwarded'}. ${complaintUserReply}`,
            target: 'specific_user',
            user_id: rideData.user_id,
            created_at: new Date().toISOString(),
            read_by: [],
            seen_by: []
          });
        }
      }

      setToast({ message: shouldResolve ? "Complaint resolved" : "Complaint forwarded", type: 'success' });
      setComplaintReplyModal(null);
      setComplaintUserReply('');
      setComplaintDriverReply('');
      setForwardToDriver(false);
      setForwardToAdminId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${complaintReplyModal.rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleManualAddRide = async () => {
    if (user.role !== 'owner') return;
    if (!manualRideData.pickup_location || !manualRideData.dropoff_location || !manualRideData.fare || !manualRideData.user_name || !manualRideData.user_phone) {
      setToast({ message: "Please fill all required fields", type: 'error' });
      return;
    }

    setIsActionLoading(true);
    try {
      const trackingId = `JKV-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const driver = adminDrivers.find(d => d.id === manualRideData.driver_id);
      
      const rideData = {
        tracking_id: trackingId,
        pickup_location: manualRideData.pickup_location,
        dropoff_location: manualRideData.dropoff_location,
        fare: parseFloat(manualRideData.fare),
        status: manualRideData.status,
        user_name: manualRideData.user_name,
        user_phone: manualRideData.user_phone,
        driver_id: manualRideData.driver_id || null,
        driver_name: driver ? driver.name : null,
        driver_phone: driver ? driver.phone : null,
        plate_number: driver ? driver.vehicle_number : null,
        trip_type: manualRideData.trip_type,
        distance: manualRideData.distance ? parseFloat(manualRideData.distance) : null,
        vehicle_type: manualRideData.vehicle_type,
        passengers: parseInt(manualRideData.passengers),
        created_at: new Date().toISOString(),
        accepted_at: manualRideData.status !== 'pending' ? new Date().toISOString() : null,
        started_at: manualRideData.status === 'ongoing' || manualRideData.status === 'completed' ? new Date().toISOString() : null,
        completed_at: manualRideData.status === 'completed' ? new Date().toISOString() : null,
      };

      const docRef = await addDoc(collection(db, 'rides'), rideData);
      
      // Log activity
      await logActivity('Manual Add Ride', `Tracking ID: ${rideData.tracking_id}, User: ${rideData.user_name}, Fare: ₹${rideData.fare}`, docRef.id, 'ride');
      
      // Send Notifications
      sendNotification('NEW_RIDE', {
        message: `New manual ride added by Admin. Tracking ID: ${rideData.tracking_id}. From: ${rideData.pickup_location} To: ${rideData.dropoff_location}. Fare: ₹${rideData.fare}`,
        phone: null
      });

      setToast({ message: "Manual ride added successfully", type: 'success' });
      setIsManualRideModalOpen(false);
      setManualRideData({
        pickup_location: '',
        dropoff_location: '',
        fare: '',
        user_name: '',
        user_phone: '',
        driver_id: '',
        status: 'pending',
        trip_type: 'single',
        distance: '',
        vehicle_type: 'Sedan (AC)',
        passengers: '1'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'rides');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotPasswordData.phone || !forgotPasswordData.dob || !forgotPasswordData.newPassword) {
      setToast({ message: "Please fill all fields", type: 'error' });
      return;
    }

    setIsActionLoading(true);
    try {
      const collectionName = forgotPasswordType === 'driver' ? 'drivers' : 'users';
      const q = query(collection(db, collectionName), where('phone', '==', forgotPasswordData.phone));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setToast({ message: "Account not found", type: 'error' });
        return;
      }

      const accountDoc = snapshot.docs[0];
      const accountData = accountDoc.data();

      if (accountData.dob !== forgotPasswordData.dob) {
        setToast({ message: "Verification failed (DOB mismatch)", type: 'error' });
        return;
      }

      await updateDoc(doc(db, collectionName, accountDoc.id), {
        password: forgotPasswordData.newPassword
      });

      setToast({ message: "Password reset successful", type: 'success' });
      setIsForgotPasswordModalOpen(false);
      setForgotPasswordData({ phone: '', dob: '', newPassword: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'accounts');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleBulkDeleteRides = async () => {
    if (user.role !== 'owner') return;
    if (selectedRides.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedRides.length} selected rides?`)) return;

    setIsActionLoading(true);
    try {
      for (const rideId of selectedRides) {
        await deleteDoc(doc(db, 'rides', rideId));
      }
      await logActivity('Bulk Delete Rides', `Deleted ${selectedRides.length} rides`);
      setToast({ message: `${selectedRides.length} rides deleted`, type: 'success' });
      setSelectedRides([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'rides');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleBulkDeleteTransactions = async () => {
    if (user.role !== 'owner' && user.role !== 'admin') return;
    if (selectedTransactions.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedTransactions.length} selected transactions?`)) return;

    setIsActionLoading(true);
    try {
      for (const txId of selectedTransactions) {
        await deleteDoc(doc(db, 'transactions', txId));
      }
      await logActivity('Bulk Delete Transactions', `Deleted ${selectedTransactions.length} transactions`);
      setToast({ message: `${selectedTransactions.length} transactions deleted`, type: 'success' });
      setSelectedTransactions([]);
      if (selectedDriverTransactions) {
        const updatedTxs = selectedDriverTransactions.transactions.filter(t => !selectedTransactions.includes(t.id));
        setSelectedDriverTransactions({ ...selectedDriverTransactions, transactions: updatedTxs });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteNotification = async (notifId: string) => {
    if (!user) return;
    if (user.role !== 'owner' && !user.permissions?.notifications) return;
    if (!window.confirm("Delete this notification?")) return;

    try {
      await deleteDoc(doc(db, 'notifications', notifId));
      await logActivity('Delete Notification', `Notification ID: ${notifId}`);
      setToast({ message: "Notification deleted", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${notifId}`);
    }
  };

  const handleUpdateNotification = async () => {
    if (!editingNotification) return;
    setIsActionLoading(true);
    try {
      await updateDoc(doc(db, 'notifications', editingNotification.id), {
        message: editingNotification.message,
        target: editingNotification.target,
        driver_id: editingNotification.driver_id || null,
        user_id: editingNotification.user_id || null
      });
      setToast({ message: "Notification updated", type: 'success' });
      setIsEditingNotificationModalOpen(false);
      setEditingNotification(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${editingNotification.id}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const fetchDriverTransactions = async (driverId: string, driverName: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('driver_id', '==', driverId), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      const transactions = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setSelectedDriverTransactions({ name: driverName, transactions });
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'transactions');
    }
  };

  const handleWithdrawalAction = async (id: string, action: 'approved' | 'rejected') => {
    try {
      const withdrawalRef = doc(db, 'withdrawal_requests', id);
      const withdrawalSnap = await getDoc(withdrawalRef);
      if (withdrawalSnap.exists()) {
        const withdrawalData = withdrawalSnap.data();
        if (action === 'approved') {
          const driverRef = doc(db, 'drivers', withdrawalData.driver_id);
          const driverSnap = await getDoc(driverRef);
          if (driverSnap.exists()) {
            const currentBalance = driverSnap.data().wallet_balance || 0;
            if (currentBalance < withdrawalData.amount) {
              setToast({ message: 'Low Driver Balance!', type: 'error', persistent: true });
              return;
            }
            await updateDoc(driverRef, { wallet_balance: currentBalance - withdrawalData.amount });
            await addDoc(collection(db, 'transactions'), {
              driver_id: withdrawalData.driver_id,
              amount: withdrawalData.amount,
              type: 'debit',
              description: `Withdrawal approved: ${id}`,
              created_at: new Date().toISOString()
            });
          }
        }
        await updateDoc(withdrawalRef, { status: action, processed_at: new Date().toISOString() });
        await logActivity(`${action === 'approved' ? 'Approve' : 'Reject'} Withdrawal`, `Request ID: ${id}`, id, 'withdrawal');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `withdrawal_requests/${id}`);
    }
  };

  const handleRequestWithdrawal = async () => {
    if (driverWallet.balance <= 0) {
      setToast({ message: 'You have ₹0 balance. You cannot request a withdrawal.', type: 'error', persistent: true });
      return;
    }

    // Check for pending withdrawal requests
    try {
      const q = query(
        collection(db, 'withdrawal_requests'),
        where('driver_id', '==', user.id),
        where('status', '==', 'pending'),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setToast({ 
          message: 'You already have a pending withdrawal request. Please wait for it to be processed.', 
          type: 'error', 
          persistent: true 
        });
        return;
      }
    } catch (err) {
      console.error("Error checking pending withdrawals:", err);
    }

    const amountStr = prompt(`Enter amount to withdraw (Available: ₹${driverWallet.balance.toFixed(2)}):`);
    if (!amountStr) return;
    const amount = Number(parseFloat(amountStr).toFixed(2));
    if (isNaN(amount) || amount <= 0) {
      setToast({ message: 'Invalid amount', type: 'error' });
      return;
    }

    if (amount > driverWallet.balance) {
      setToast({ message: `Low Balance! You only have ₹${driverWallet.balance.toFixed(2)}`, type: 'error', persistent: true });
      return;
    }

    const bankDetails = prompt('Enter Bank Details (Account No, IFSC, etc.):');
    if (!bankDetails) {
      setToast({ message: 'Bank details are required', type: 'error' });
      return;
    }

    try {
      await addDoc(collection(db, 'withdrawal_requests'), {
        driver_id: user.id,
        driver_name: user.name || user.username || 'Driver',
        amount,
        bank_details: bankDetails,
        status: 'pending',
        created_at: new Date().toISOString()
      });
      setToast({ message: 'Withdrawal request submitted!', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'withdrawal_requests');
    }
  };

  const fetchDriverData = () => {};

  const handleChangeAdminCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'admins', user.id), {
        password: changeCreds.password,
        pin: changeCreds.pin
      });
      setUser({ ...user, password: changeCreds.password, pin: changeCreds.pin });
      setChangeCreds({ password: '', pin: '' });
      setToast({ message: 'Credentials updated successfully!', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `admins/${user.id}`);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      if (adminLoginStep === 'credentials') {
        const q = query(
          collection(db, 'admins'), 
          where('username', '==', loginData.username), 
          where('password', '==', loginData.password),
          limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setTempAdminId(snapshot.docs[0].id);
          setAdminLoginStep('pin');
        } else {
          setError('Invalid admin credentials');
        }
      } else {
        if (!tempAdminId) return;
        const adminDoc = await getDoc(doc(db, 'admins', tempAdminId));
        if (adminDoc.exists() && adminDoc.data().pin === adminPin) {
          const adminData = { ...adminDoc.data(), id: adminDoc.id } as AdminUser;
          // Shafiq Choudhary is always the owner
          if (adminData.username === 'Shafiq Choudhary') {
            adminData.role = 'owner';
          }
          setUser(adminData);
          localStorage.setItem('skydrive_auth', JSON.stringify(adminData));
          setView('admin');
          setAdminLoginStep('credentials');
          setTempAdminId(null);
          setAdminPin('');
          setError('');
          
          // Auto-subscribe to notifications
          subscribeToPushNotifications();
        } else {
          setError('Invalid PIN');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const subscribeToPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission denied');
        return;
      }

      // Subscribe
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY
      });

      // Send to server
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      console.log('Push subscription successful');
    } catch (err) {
      console.error('Error subscribing to push notifications:', err);
    }
  };

  const handleDriverLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsVerifying(true);
    
    try {
      const q = query(
        collection(db, 'drivers'), 
        where('phone', '==', loginData.phone), 
        where('password', '==', loginData.password),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const driverDoc = snapshot.docs[0];
        const driverData = { ...driverDoc.data(), id: driverDoc.id, role: 'driver' };
        setUser(driverData);
        localStorage.setItem('skydrive_auth', JSON.stringify(driverData));
        setToast({ message: 'Login successful!', type: 'success' });
        
        // Subscribe to push notifications
        subscribeToPushNotifications();
      } else {
        setError('Invalid phone number or password');
      }
    } catch (err: any) {
      console.error("Driver Login Error:", err);
      setError(err.message || 'Login failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDriverRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginData.name || !loginData.phone || !loginData.password) {
      setError('Please fill all fields');
      return;
    }
    setError('');
    setIsVerifying(true);
    try {
      // Check if phone exists in drivers
      const qDriver = query(collection(db, 'drivers'), where('phone', '==', loginData.phone), limit(1));
      const snapshotDriver = await getDocs(qDriver);
      if (!snapshotDriver.empty) {
        setError('Driver with this phone already exists');
        return;
      }

      // Check if phone exists in users
      const qUser = query(collection(db, 'users'), where('phone', '==', loginData.phone), limit(1));
      const snapshotUser = await getDocs(qUser);
      if (!snapshotUser.empty) {
        setError('This phone is already registered as a Passenger. You cannot have both profiles.');
        return;
      }

      const data = {
        name: loginData.name,
        phone: loginData.phone,
        password: loginData.password,
        dob: loginData.dob,
        vehicle_number: loginData.vehicle_number,
        vehicle_type: loginData.vehicle_type,
        vehicle_seats: parseInt(loginData.vehicle_seats),
        vehicle_category: loginData.vehicle_category,
        wallet_balance: 0,
        last_maintenance_deduction: new Date().toISOString(),
        status: 'under verification',
        created_at: new Date().toISOString(),
        role: 'driver'
      };

      const docRef = await addDoc(collection(db, 'drivers'), data);
      const driverData = { ...data, id: docRef.id };
      setUser(driverData);
      localStorage.setItem('skydrive_auth', JSON.stringify(driverData));
      setToast({ message: 'Registration successful!', type: 'success' });
      
      // Auto-subscribe to notifications
      subscribeToPushNotifications();
    } catch (err: any) {
      console.error("Driver Registration Error:", err);
      setError(err.message || 'Registration failed');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (view === 'user' && !trackedRide && pickupRef.current && dropoffRef.current) {
      initAutocomplete();
    }
  }, [view, trackedRide, pickupRef.current, dropoffRef.current]);

  useEffect(() => {
    if (trackedRide) {
      const geocodeTracked = async () => {
        if (trackedRide.pickup_location) {
          const fetchTrackedPickupNominatim = async () => {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(trackedRide.pickup_location)}&limit=1`);
              const data = await res.json();
              if (data && data[0]) {
                setTrackedPickupCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
              }
            } catch (e) {
              console.error(e);
            }
          };

          if (window.google) {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: trackedRide.pickup_location, componentRestrictions: { country: 'IN' } }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                const loc = results[0].geometry.location;
                setTrackedPickupCoords({ lat: loc.lat(), lng: loc.lng() });
              } else {
                fetchTrackedPickupNominatim();
              }
            });
          } else {
            await fetchTrackedPickupNominatim();
          }
        }
        if (trackedRide.dropoff_location) {
          const fetchTrackedDropoffNominatim = async () => {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(trackedRide.dropoff_location)}&limit=1`);
              const data = await res.json();
              if (data && data[0]) {
                setTrackedDropoffCoords({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
              }
            } catch (e) {
              console.error(e);
            }
          };

          if (window.google) {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ address: trackedRide.dropoff_location, componentRestrictions: { country: 'IN' } }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                const loc = results[0].geometry.location;
                setTrackedDropoffCoords({ lat: loc.lat(), lng: loc.lng() });
              } else {
                fetchTrackedDropoffNominatim();
              }
            });
          } else {
            await fetchTrackedDropoffNominatim();
          }
        }
      };
      geocodeTracked();
    } else {
      setTrackedPickupCoords(null);
      setTrackedDropoffCoords(null);
    }
  }, [trackedRide?.id, trackedRide?.pickup_location, trackedRide?.dropoff_location]);

  const autoCalculateDistance = async (customPickup?: string, customDropoff?: string) => {
    const pickupVal = customPickup !== undefined ? customPickup : (pickupRef.current?.value || bookingData.pickup);
    const dropoffVal = customDropoff !== undefined ? customDropoff : (dropoffRef.current?.value || bookingData.dropoff);

    if (!pickupVal || !dropoffVal) return;

    setIsEstimating(true);
    setError('');

    geocodeLocation(pickupVal, 'pickup');
    geocodeLocation(dropoffVal, 'dropoff');

    try {
      const data = await calculateRealFare(
        pickupVal,
        dropoffVal,
        bookingData.tripType,
        undefined,
        user?.consecutive_cancellations || 0
      );
      if (data && data.distance) {
        setBookingData(prev => ({ 
          ...prev, 
          pickup: pickupVal,
          dropoff: dropoffVal,
          manualDistance: String(data.distance) 
        }));
        setEstimatedDistance(data.distance);
        setFareOptions(data.options || []);
        setSelectedOption(data.options?.[0] || null);
      }
    } catch (err: any) {
      console.error("Auto calculation error:", err);
    } finally {
      setIsEstimating(false);
    }
  };

  const initAutocomplete = () => {
    if (!window.google || !pickupRef.current || !dropoffRef.current) return;

    // Avoid re-initializing if already attached
    if ((pickupRef.current as any)._autocomplete) return;

    const pickupAutocomplete = new google.maps.places.Autocomplete(pickupRef.current, {
      componentRestrictions: { country: "in" }
    });
    (pickupRef.current as any)._autocomplete = pickupAutocomplete;
    pickupAutocomplete.addListener('place_changed', () => {
      const place = pickupAutocomplete.getPlace();
      if (place.formatted_address) {
        setBookingData(prev => ({ ...prev, pickup: place.formatted_address! }));
        autoCalculateDistance(place.formatted_address, undefined);
      }
    });

    const dropoffAutocomplete = new google.maps.places.Autocomplete(dropoffRef.current, {
      componentRestrictions: { country: "in" }
    });
    (dropoffRef.current as any)._autocomplete = dropoffAutocomplete;
    dropoffAutocomplete.addListener('place_changed', () => {
      const place = dropoffAutocomplete.getPlace();
      if (place.formatted_address) {
        setBookingData(prev => ({ ...prev, dropoff: place.formatted_address! }));
        autoCalculateDistance(undefined, place.formatted_address);
      }
    });
  };

  useEffect(() => {
    if (view === 'user' && user && !bookingData.pickup) {
      const checkGoogle = setInterval(() => {
        if (window.google) {
          clearInterval(checkGoogle);
          getCurrentLocation();
        }
      }, 500);
      return () => clearInterval(checkGoogle);
    }
  }, [view, user]);

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      setIsLiveLocationLoading(true);
      navigator.geolocation.getCurrentPosition((position) => {
        if (!window.google) {
          setIsLiveLocationLoading(false);
          return;
        }
        const geocoder = new google.maps.Geocoder();
        const latlng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        geocoder.geocode({ location: latlng }, (results, status) => {
          setIsLiveLocationLoading(false);
          if (status === "OK" && results?.[0]) {
            const addr = results[0].formatted_address;
            setBookingData(prev => ({ ...prev, pickup: addr }));
            setPickupCoords(latlng);
            autoCalculateDistance(addr, undefined);
          }
        });
      }, (error) => {
        console.error("Geolocation error:", error);
        setIsLiveLocationLoading(false);
      });
    }
  };

  const geocodeLocation = async (address: string, type: 'pickup' | 'dropoff') => {
    if (!address) return;
    
    const geocodeWithNominatim = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(address)}&limit=1`);
        const data = await res.json();
        if (data && data[0]) {
          const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          if (type === 'pickup') setPickupCoords(coords);
          else setDropoffCoords(coords);
        }
      } catch (e) {
        console.error("Geocoding fallback error:", e);
      }
    };

    // Try Google first if available
    if (window.google) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address, componentRestrictions: { country: 'IN' } }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc = results[0].geometry.location;
          const coords = { lat: loc.lat(), lng: loc.lng() };
          if (type === 'pickup') setPickupCoords(coords);
          else setDropoffCoords(coords);
        } else {
          console.warn(`Google Geocoding failed (Status: ${status}). Falling back to Nominatim.`);
          geocodeWithNominatim();
        }
      });
      return;
    }

    await geocodeWithNominatim();
  };

  const reverseGeocodeLocation = async (coords: { lat: number, lng: number }, type: 'pickup' | 'dropoff') => {
    const reverseGeocodeWithNominatim = async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
        const data = await res.json();
        if (data && data.display_name) {
          const address = data.display_name;
          setBookingData(prev => ({
            ...prev,
            [type]: address
          }));
          autoCalculateDistance(
            type === 'pickup' ? address : undefined,
            type === 'dropoff' ? address : undefined
          );
        }
      } catch (e) {
        console.error("Reverse geocoding fallback error:", e);
      }
    };

    if (window.google) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: { lat: coords.lat, lng: coords.lng } }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const address = results[0].formatted_address;
          setBookingData(prev => ({
            ...prev,
            [type]: address
          }));
          autoCalculateDistance(
            type === 'pickup' ? address : undefined,
            type === 'dropoff' ? address : undefined
          );
        } else {
          console.warn(`Google Reverse Geocoding failed (Status: ${status}). Falling back to Nominatim.`);
          reverseGeocodeWithNominatim();
        }
      });
      return;
    }

    await reverseGeocodeWithNominatim();
  };

  const handleMapDistanceChange = async (distance: number) => {
    setEstimatedDistance(distance);
    setBookingData(prev => ({
      ...prev,
      manualDistance: String(distance)
    }));
    
    try {
      const data = await calculateRealFare(
        bookingData.pickup,
        bookingData.dropoff,
        bookingData.tripType,
        distance,
        user?.consecutive_cancellations || 0
      );
      if (data && data.options) {
        setFareOptions(data.options);
        setSelectedOption(data.options[0] || null);
      }
    } catch (err) {
      console.error("Error updating fare from map distance:", err);
    }
  };

  const handleMapPickupChange = (coords: { lat: number, lng: number }) => {
    setPickupCoords(coords);
    reverseGeocodeLocation(coords, 'pickup');
  };

  const handleMapDropoffChange = (coords: { lat: number, lng: number }) => {
    setDropoffCoords(coords);
    reverseGeocodeLocation(coords, 'dropoff');
  };

  const handleFindRides = async (overrideTripType?: 'single' | 'round') => {
    if (!bookingData.pickup || !bookingData.dropoff) {
      setError('Please fill both pickup and dropoff locations');
      return;
    }
    setIsEstimating(true);
    setError('');
    setShowManualFormOption(false);
    
    // Geocode both locations for the map
    geocodeLocation(bookingData.pickup, 'pickup');
    geocodeLocation(bookingData.dropoff, 'dropoff');

    try {
      const manualDist = bookingData.manualDistance ? parseFloat(bookingData.manualDistance) : undefined;
      const data = await calculateRealFare(
        bookingData.pickup, 
        bookingData.dropoff, 
        overrideTripType || bookingData.tripType, 
        manualDist,
        user?.consecutive_cancellations || 0
      );
      setFareOptions(data.options || []);
      setEstimatedDistance(data.distance || null);
      if (data.distance && !bookingData.manualDistance) {
        setBookingData(prev => ({ ...prev, manualDistance: String(data.distance) }));
      }
      setSelectedOption(data.options?.[0] || null);
      
      // If no options or invalid options found, offer manual address form
      if (!data.options || data.options.length === 0 || !data.distance || data.distance <= 0) {
        setShowManualFormOption(true);
      }
    } catch (err: any) {
      console.error("Estimation error:", err);
      setError(err.message || 'Failed to estimate fare automatically. Use the Manual detailed booking form below.');
      setShowManualFormOption(true);
    } finally {
      setIsEstimating(false);
    }
  };

  const rechargeOptions = [
    { amount: 251, freeRides: 0 },
    { amount: 349, freeRides: 1 },
    { amount: 435, freeRides: 1 },
    { amount: 578, freeRides: 2 },
    { amount: 621, freeRides: 2 },
    { amount: 745, freeRides: 3 },
    { amount: 832, freeRides: 4 },
    { amount: 951, freeRides: 5 },
    { amount: 1015, freeRides: 6 },
  ];

  const handleRazorpayPayment = async (amount: number, description: string, onSuccess: (response: any) => void) => {
    if (!(window as any).Razorpay) {
      setToast({ message: 'Razorpay SDK not loaded. Please check your internet connection.', type: 'error' });
      return;
    }

    try {
      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, receipt: `receipt_${Date.now()}` }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || 'Failed to create order');
      }
      
      const order = data;

      const options = {
        key: configStatus?.razorpay_key_id || (import.meta as any).env.VITE_RAZORPAY_KEY_ID || 'rzp_live_SZ19ACg52mDGSZ',
        amount: order.amount,
        currency: order.currency,
        name: 'SkyDrive',
        description: description,
        order_id: order.id,
        handler: onSuccess,
        modal: {
          ondismiss: () => {
            setIsBooking(false);
            setIsActionLoading(false);
          }
        },
        prefill: {
          name: user?.name || user?.username,
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: { color: '#18181b' },
      };

      if (!(window as any).Razorpay) {
        throw new Error('Razorpay SDK not loaded. Please check your internet connection.');
      }

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('Payment Error:', err);
      setToast({ message: `Payment Error: ${err.message}`, type: 'error' });
      setIsBooking(false);
      setIsActionLoading(false);
    }
  };

  const handleBookRide = async (option?: any) => {
    const targetOption = option || selectedOption;
    if (!targetOption || !user) return;
    
    if (user.role === 'driver') {
      setToast({ message: "Drivers cannot book rides as passengers.", type: 'error' });
      return;
    }
    
    if (option) setSelectedOption(option);

    const bookingAmount = targetOption.fare;
    const advanceAmount = Math.round(bookingAmount * 0.1);
    
    setToast({ message: `Opening Razorpay for ₹${advanceAmount} advance payment...`, type: 'success' });
    
    handleRazorpayPayment(advanceAmount, `Booking Advance for ${targetOption.type}`, async (response) => {
      setIsBooking(true);
      try {
        const rideData = {
          user_id: user.id,
          user_name: user.name || user.username || 'User',
          user_phone: user.phone,
          pickup_location: bookingData.pickup,
          dropoff_location: bookingData.dropoff,
          pickup_coords: pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : null,
          dropoff_coords: dropoffCoords ? { lat: dropoffCoords.lat, lng: dropoffCoords.lng } : null,
          distance: estimatedDistance,
          fare: targetOption.fare,
          discount: targetOption.discount || 0,
          vehicle_type: targetOption.type,
          passengers: parseInt(bookingData.passengers),
          trip_type: bookingData.tripType,
          pickup_date: bookingData.pickupDate,
          pickup_time: bookingData.pickupTime,
          status: 'pending' as RideStatus,
          tracking_id: `CB${Math.floor(10000 + Math.random() * 90000)}`,
          created_at: new Date().toISOString(),
          advance_paid: advanceAmount,
          payment_id: response.razorpay_payment_id
        };
        const docRef = await addDoc(collection(db, 'rides'), rideData);
        
        // Send Notifications
        sendNotification('NEW_BOOKING', {
          message: `New ride booked by ${user.name || user.username || 'User'}. Tracking ID: ${rideData.tracking_id}. From: ${rideData.pickup_location} To: ${rideData.dropoff_location}. Fare: ₹${rideData.fare}`,
          phone: user.phone
        });

        setFareOptions([]);
        setBookingData({ 
          pickup: '', 
          dropoff: '', 
          tripType: 'single', 
          manualDistance: '',
          passengers: '1',
          pickupDate: new Date().toISOString().split('T')[0],
          pickupTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
        });
        setTrackedRide(null);
        setTrackingId('');
        setError('');
        setToast({ message: `Ride booked successfully! Tracking ID: ${rideData.tracking_id}`, type: 'success' });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'rides');
        setError('Booking failed. Please try again.');
      } finally {
        setIsBooking(false);
      }
    });
  };

  const handleRechargeWallet = async (option: any) => {
    handleRazorpayPayment(option.amount, `Wallet Recharge - ₹${option.amount}`, async (response) => {
      try {
        const amountToAdd = option.amount;
        const freeRidesToAdd = user!.role === 'driver' ? (option.freeRides || 0) : 0;
        const collectionName = user!.role === 'driver' ? 'drivers' : 'users';
        const userRef = doc(db, collectionName, user!.id);
        
        await runTransaction(db, async (transaction) => {
          const userDoc = await transaction.get(userRef);
          const currentBalance = userDoc.exists() ? (userDoc.data()?.wallet_balance || 0) : 0;
          const currentFreeRides = userDoc.exists() ? (userDoc.data()?.free_rides || 0) : 0;
          
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 2);
          
          transaction.update(userRef, { 
            wallet_balance: currentBalance + amountToAdd,
            free_rides: currentFreeRides + freeRidesToAdd,
            free_rides_expiry: freeRidesToAdd > 0 ? expiryDate.toISOString() : (userDoc.data()?.free_rides_expiry || null)
          });
          
          const txRef = doc(collection(db, 'transactions'));
          const txData: any = {
            id: txRef.id,
            amount: amountToAdd,
            type: 'credit',
            description: `Wallet Recharge (₹${option.amount}${freeRidesToAdd > 0 ? ` + ${freeRidesToAdd} Commission-Free Rides (Under 15km)` : ''})`,
            created_at: new Date().toISOString(),
          };

          if (user!.role === 'driver') {
            txData.driver_id = user!.id;
          } else {
            txData.user_id = user!.id;
          }

          transaction.set(txRef, txData);
        });
        
        setToast({ 
          message: `₹${amountToAdd} added to wallet!${freeRidesToAdd > 0 ? ` You also got ${freeRidesToAdd} Commission-Free Rides (Under 15km)!` : ''}`, 
          type: 'success' 
        });
        setIsRechargeModalOpen(false);
      } catch (err) {
        console.error('Recharge Error:', err);
        setToast({ message: 'Failed to update wallet balance', type: 'error' });
      }
    });
  };

  const handleTrackRide = async () => {
    if (!trackingId) return;
    try {
      const q = query(collection(db, 'rides'), where('tracking_id', '==', trackingId));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setTrackedRide({ ...snapshot.docs[0].data(), id: snapshot.docs[0].id } as Ride);
      } else {
        setError('Ride not found');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `rides?tracking_id=${trackingId}`);
    }
  };

  const preCheckAcceptRide = async (ride: Ride) => {
    // 1. Check if driver already has an active ride
    const hasActiveRide = availableRides.some(r => 
      r.driver_id === user.id && 
      (r.status === 'accepted' || r.status === 'ongoing')
    );

    if (hasActiveRide) {
      setToast({ 
        message: "You already have an active ride! Please complete it before accepting another.", 
        type: 'error',
        persistent: true
      });
      return;
    }

    // 2. Check balance - Mandatory minimum balance of ₹249 required to accept ANY ride
    const MIN_ACCEPT_BALANCE = 249;
    
    if (driverWallet.balance < MIN_ACCEPT_BALANCE) {
      setToast({ 
        message: `Low Balance! You need a minimum balance of ₹${MIN_ACCEPT_BALANCE} in your wallet to accept any ride.`, 
        type: 'error',
        persistent: true
      });
      setIsRechargeModalOpen(true);
      return;
    }

    // 3. Check Vehicle Capacity
    const requiredSeats = (VEHICLE_RATES as any)[ride.vehicle_type]?.seats || 4;
    const driverSeats = parseInt(user.vehicle_seats || '4');

    if (driverSeats < requiredSeats) {
      setToast({ 
        message: `Ineligible Vehicle! This ride requires a ${ride.vehicle_type} (${requiredSeats} seats), but your vehicle only has ${driverSeats} seats.`, 
        type: 'error',
        persistent: true
      });
      return;
    }

    setAcceptingRideId(ride.id);
  };

  const handleAcceptRide = async (rideId: string) => {
    if (user?.role !== 'driver') {
      setToast({ message: "Only registered drivers can accept rides.", type: 'error' });
      return;
    }
    if (!etaInput) {
      setAcceptingRideId(rideId);
      return;
    }
    setIsActionLoading(true);
    stopRing();
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      
        if (rideSnap.exists() && rideSnap.data().status === 'pending') {
          const rideData = rideSnap.data();
          
          // Final capacity check
          const requiredSeats = (VEHICLE_RATES as any)[rideData.vehicle_type]?.seats || 4;
          const driverSeats = parseInt(user.vehicle_seats || '4');
          
          if (driverSeats < requiredSeats) {
            setToast({ message: `Ineligible Vehicle! This ride requires a ${rideData.vehicle_type} (${requiredSeats} seats).`, type: 'error' });
            setIsActionLoading(false);
            return;
          }

          // Check passenger count against vehicle seats
          if (rideData.passengers > driverSeats) {
            setError(`Your vehicle (${driverSeats} seats) cannot accommodate ${rideData.passengers} passengers.`);
            setIsActionLoading(false);
            return;
          }

          // Final balance check before acceptance - Mandatory minimum balance of ₹249
          const MIN_ACCEPT_BALANCE = 249;
          
          if (driverWallet.balance < MIN_ACCEPT_BALANCE) {
            setError(`Low Balance! You need a minimum balance of ₹${MIN_ACCEPT_BALANCE} in your wallet to accept any ride.`);
            setIsRechargeModalOpen(true);
            setIsActionLoading(false);
            return;
          }

          const startOtp = Math.floor(1000 + Math.random() * 9000).toString();
        const endOtp = Math.floor(1000 + Math.random() * 9000).toString();
        await updateDoc(rideRef, {
          driver_id: user.id,
          driver_name: user.name || user.username || 'Driver',
          driver_phone: user.phone,
          vehicle_type: user.vehicle_type || 'Vehicle',
          plate_number: user.vehicle_number || 'N/A',
          status: 'accepted',
          eta: parseInt(etaInput),
          start_otp: startOtp,
          end_otp: endOtp,
          accepted_at: new Date().toISOString()
        });

        // Send Notifications
        const vehicleInfo = `${user.vehicle_type || 'Vehicle'} (${user.vehicle_number || 'N/A'})`;
        sendNotification('RIDE_ACCEPTED', {
          message: `Ride ${rideData?.tracking_id} accepted by ${user.name || 'Driver'}. Vehicle: ${vehicleInfo}. ETA: ${etaInput} mins. Start OTP: ${startOtp}`,
          phone: rideData?.user_phone
        });

        setAcceptingRideId(null);
        setEtaInput('');
        setToast({ message: "Ride Accepted!", type: 'success' });
      } else {
        setError('Ride is no longer available');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStartRide = async (rideId: string) => {
    if (!otpInput) return;
    setIsActionLoading(true);
    const trimmedOtp = otpInput.trim();
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      if (rideSnap.exists() && rideSnap.data().start_otp === trimmedOtp) {
        await updateDoc(rideRef, {
          status: 'ongoing',
          started_at: new Date().toISOString()
        });

        // Send Notifications
        const rideData = rideSnap.data();
        sendNotification('RIDE_STARTED', {
          message: `Ride ${rideData?.tracking_id} has started. Driver ${user?.name} is on the way to destination.`,
          phone: rideData?.user_phone
        });

        setOtpInput('');
        setToast({ message: 'Ride started successfully!', type: 'success' });
      } else {
        setToast({ message: 'Invalid OTP', type: 'error' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCompleteRide = async (rideId: string) => {
    if (!otpInput) {
      setToast({ message: 'Enter End OTP', type: 'error' });
      return;
    }
    setIsActionLoading(true);
    const trimmedOtp = otpInput.trim();
    try {
      const rideRef = doc(db, 'rides', rideId);
      const rideSnap = await getDoc(rideRef);
      if (rideSnap.exists() && rideSnap.data().end_otp === trimmedOtp) {
        const rideData = rideSnap.data();
        
        const actualDistance = parseFloat(actualKmInput);
        let extraCharge = 0;
        let finalTotalFare = rideData.fare || 0;
        
        const currentRate = (VEHICLE_RATES as any)[rideData.vehicle_type]?.perKm || 15;
        if (!isNaN(actualDistance) && actualDistance > (rideData.distance || 0)) {
          const extraKm = actualDistance - (rideData.distance || 0);
          extraCharge = Math.round(extraKm * currentRate);
          finalTotalFare = (rideData.fare || 0) + extraCharge;
        }

        await updateDoc(rideRef, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          actual_distance: isNaN(actualDistance) ? (rideData.distance || 0) : actualDistance,
          extra_charge: extraCharge,
          final_total_fare: finalTotalFare
        });

        // Clear actual KM input state after completion
        setActualKmInput('');

        // Reset user's consecutive cancellations
        const rideUserId = rideData.user_id;
        if (rideUserId) {
          const userRef = doc(db, 'users', rideUserId);
          await updateDoc(userRef, { consecutive_cancellations: 0 });
          // Update local state if it's the current user
          if (user?.id === rideUserId) {
            setUser(prev => prev ? { ...prev, consecutive_cancellations: 0 } : null);
          }
        }

        // Send Notifications
        sendNotification('RIDE_COMPLETED', {
          message: `Ride ${rideData?.tracking_id} completed. Total Fare: ₹${finalTotalFare}${extraCharge > 0 ? ` (includes ₹${extraCharge} extra charge for additional distance)` : ''}. Thank you for riding with SkyDrive!`,
          phone: rideData?.user_phone
        });

        // Commission Logic
        const advancePaid = rideData.advance_paid || 0;
        if (advancePaid === 0) {
          // If no advance paid by passenger, deduct 10% commission from driver's wallet
          const driverId = rideData.driver_id;
          if (driverId) {
            const driverRef = doc(db, 'drivers', driverId);
            const driverSnap = await getDoc(driverRef);
            if (driverSnap.exists()) {
              const driverData = driverSnap.data();
              const freeRides = driverData.free_rides || 0;
              const distance = rideData.distance || 0;
              const fare = finalTotalFare;
              const commission = Number((fare * 0.1).toFixed(2));

              const isOfferValid = freeRides > 0 && (!driverData.free_rides_expiry || new Date(driverData.free_rides_expiry) > new Date());
              if (isOfferValid && distance <= 15) {
                // Use commission-free ride
                await updateDoc(driverRef, { 
                  free_rides: freeRides - 1
                });
                
                // Add transaction
                await addDoc(collection(db, 'transactions'), {
                  driver_id: driverId,
                  amount: 0,
                  type: 'debit',
                  description: `Ride completed: ${rideData.tracking_id || rideId} (Commission-Free Ride Used - Under 15km)`,
                  created_at: new Date().toISOString()
                });
              } else {
                // Standard commission deduction
                const newBalance = Number(((driverData.wallet_balance || 0) - commission).toFixed(2));
                await updateDoc(driverRef, { 
                  wallet_balance: newBalance 
                });
                
                // Add transaction
                if (commission > 0) {
                  await addDoc(collection(db, 'transactions'), {
                    driver_id: driverId,
                    amount: commission,
                    type: 'debit',
                    description: `Ride completed: ${rideData.tracking_id || rideId} (10% Commission Deducted)`,
                    created_at: new Date().toISOString()
                  });
                }
              }
            }
          }
        } else {
          // If advance paid, it serves as the commission. No wallet update needed.
        }

        setOtpInput('');
        setToast({ message: 'Ride completed successfully!', type: 'success' });
      } else {
        setToast({ message: 'Invalid OTP', type: 'error' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rides/${rideId}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelRide = async (rideId: string) => {
    if (!user) return;
    setCancellationModal({ rideId, type: 'driver' });
  };

  const setDriverStatus = async (driverId: string, newStatus: 'active' | 'inactive' | 'under verification' | 'documents received' | 'rejected' | 'documents not received') => {
    try {
      await updateDoc(doc(db, 'drivers', driverId), { status: newStatus });
      await logActivity('Update Driver Status', `Driver ID: ${driverId}, New Status: ${newStatus}`, driverId, 'driver');
      setToast({ message: `Driver status updated to ${newStatus}`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
    }
  };

  const toggleDriverStatus = async (driverId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'drivers', driverId), { status: newStatus });
      await logActivity('Toggle Driver Status', `Driver ID: ${driverId}, New Status: ${newStatus}`, driverId, 'driver');
      setToast({ message: `Driver status updated to ${newStatus}`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
    }
  };

  if (isLoggingOut) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[10000] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-900 font-black uppercase tracking-widest animate-pulse">Processing...</p>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm w-full">
          <div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-zinc-900 font-black uppercase tracking-[0.2em] animate-pulse">Initializing...</p>
        </div>
      </div>
    );
  }

  const filteredRides = adminRides.filter(r => 
    (searchCategory === 'all' || searchCategory === 'rides') && (
      r.tracking_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r as any).user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r as any).user_phone?.includes(searchTerm) ||
      (r as any).driver_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.pickup_location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.dropoff_location.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const filteredDrivers = adminDrivers.filter(d => 
    (searchCategory === 'all' || searchCategory === 'drivers') && (
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm) ||
      d.username?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const filteredUsers = adminUsers.filter(u => 
    (searchCategory === 'all' || searchCategory === 'users') && (
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone.includes(searchTerm)
    )
  );

  const filteredWithdrawals = adminWithdrawals.filter(w => 
    (searchCategory === 'all' || searchCategory === 'withdrawals') && (
      w.driver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.driver_phone.includes(searchTerm)
    )
  );

  const filteredNotifications = adminNotifications.filter(n => 
    (searchCategory === 'all' || searchCategory === 'notifications') && (
      n.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.target.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#f8fafc] font-sans text-zinc-900 overflow-x-hidden">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-200/30 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-200/30 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <Navbar 
        activeView={view} 
        setView={changeView} 
        onLogout={user ? handleLogout : undefined} 
        user={user} 
      />

      {/* Background Blobs */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-rose-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '4s' }} />
      </div>

      <main className={`${user ? 'pt-36' : 'pt-32'} pb-12 px-3 sm:px-4 max-w-4xl mx-auto`}>
      <AnimatePresence mode="wait">
          {/* USER VIEW */}
          {view === 'user' && (
            <motion.div
              key="user"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {user && error && (
                <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
                  {error}
                  <button onClick={() => setError('')} className="float-right"><X className="w-4 h-4" /></button>
                </div>
              )}

              {!user ? (
                  <motion.div 
                    initial={{ rotateY: -20, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    className="max-w-md mx-auto glass p-10 rounded-[2.5rem] relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-rose-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    
                    <h2 className="text-xl sm:text-2xl font-black mb-8 flex items-center gap-3">
                      <div className="p-2 bg-brand-primary rounded-xl shadow-lg shrink-0">
                        <User className="text-white w-6 h-6" /> 
                      </div>
                      <span className="gradient-text truncate max-w-[200px] sm:max-w-none">
                        {userAuthMode === 'login' ? 'Passenger Login' : 'Create Account'}
                      </span>
                    </h2>
                  {error && (
                    <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
                      {error}
                      <button onClick={() => setError('')} className="float-right"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                  
                  <form onSubmit={userAuthMode === 'login' ? handleUserLogin : handleUserRegister} className="space-y-4">
                        {userAuthMode === 'register' && (
                          <div className="space-y-4">
                            <input
                              type="text"
                              placeholder="Full Name"
                              required
                              className="w-full px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                              value={userLoginData.name}
                              onChange={e => setUserLoginData({ ...userLoginData, name: e.target.value })}
                            />
                            <div className="space-y-1">
                              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Date of Birth</label>
                              <input
                                type="date"
                                required
                                className="w-full px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                                value={userLoginData.dob}
                                onChange={e => setUserLoginData({ ...userLoginData, dob: e.target.value })}
                              />
                            </div>
                          </div>
                        )}
                        <input
                          type="tel"
                          placeholder="Phone Number (e.g. 9876543210)"
                          required
                          className="w-full px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                          value={userLoginData.phone}
                          onChange={e => setUserLoginData({ ...userLoginData, phone: e.target.value })}
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          required
                          className="w-full px-4 py-3 bg-rose-50 border border-rose-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                          value={userLoginData.password}
                          onChange={e => setUserLoginData({ ...userLoginData, password: e.target.value })}
                        />

                        {userAuthMode === 'login' && (
                          <div className="flex justify-end">
                            <button 
                              type="button"
                              onClick={() => {
                                setForgotPasswordType('user');
                                setIsForgotPasswordModalOpen(true);
                              }}
                              className="text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
                            >
                              Forgot Password?
                            </button>
                          </div>
                        )}
                        
                        <motion.button 
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={isVerifying}
                          className="w-full bg-brand-primary text-white py-4 rounded-2xl font-black shadow-xl hover:shadow-2xl transition-all btn-3d disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isVerifying ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            userAuthMode === 'login' ? 'Login' : 'Register'
                          )}
                        </motion.button>
                      </form>

                        <div className="mt-6 text-center space-y-2">
                          <button 
                            onClick={() => {
                              setUserAuthMode(userAuthMode === 'login' ? 'register' : 'login');
                            setError('');
                          }}
                          className="block w-full text-sm font-medium text-zinc-500 hover:text-zinc-900"
                        >
                          {userAuthMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
                        </button>
                        <div className="pt-6 space-y-4">
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                              <div className="w-full border-t border-zinc-100"></div>
                            </div>
                            <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold text-zinc-400">
                              <span className="bg-white px-3">Are you a driver?</span>
                            </div>
                          </div>

                          <button 
                            onClick={() => setView('driver')}
                            className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-200 group active:scale-[0.98]"
                          >
                            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Car className="w-5 h-5" />
                            </div>
                            <div className="text-left leading-tight">
                              <p className="text-xs opacity-80 font-medium">Earn money with us</p>
                              <p className="text-base">Driver Login Here</p>
                            </div>
                          </button>

                          <div className="flex justify-center pt-2">
                            <button 
                              onClick={() => setView('admin')}
                              className="text-[10px] font-bold text-zinc-300 hover:text-zinc-500 uppercase tracking-[0.2em] transition-colors"
                            >
                              Team Access Only
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        {user.role === 'driver' && (
                          <motion.div 
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="glass p-6 rounded-[2rem] flex items-center justify-between group relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 blur-xl group-hover:scale-150 transition-transform duration-700" />
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-emerald-100 rounded-2xl">
                                <Wallet className="w-6 h-6 text-emerald-600" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Wallet Balance</p>
                                <p className="text-2xl font-black">₹{(user.wallet_balance || 0).toFixed(2)}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setIsRechargeModalOpen(true)}
                              className="p-2 bg-brand-primary text-white rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg"
                            >
                              <PlusCircle className="w-5 h-5" />
                            </button>
                          </motion.div>
                        )}

                        {user.role === 'driver' && (
                          <motion.div 
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="glass p-6 rounded-[2rem] flex items-center justify-between group relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-12 -mt-12 blur-xl group-hover:scale-150 transition-transform duration-700" />
                            <div className="flex items-center gap-4">
                              <div className="p-3 bg-indigo-100 rounded-2xl">
                                <Zap className="w-6 h-6 text-indigo-600" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Free Rides (Under 15km)</p>
                                <p className="text-2xl font-black">{user.free_rides || 0}</p>
                              </div>
                            </div>
                            <div className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                              Active
                            </div>
                          </motion.div>
                        )}
                      </div>

                      <div className="text-center space-y-3 mb-10">
                    <motion.h1 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="text-3xl sm:text-4xl font-black tracking-tighter"
                    >
                      Welcome, <span className="gradient-text">{user.name || user.username || 'User'}!</span>
                    </motion.h1>
                    <p className="text-zinc-500 font-medium">Ready for your next adventure?</p>
                  </div>

                  <motion.div 
                    initial={{ y: 30, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="glass p-8 rounded-[2.5rem] space-y-8 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 via-rose-500 to-indigo-600" />
                    {/* Trip Type Toggle */}
                    <div className="flex p-1 bg-zinc-100/50 backdrop-blur-sm rounded-2xl border border-zinc-200/50">
                      <button
                        onClick={() => {
                          setBookingData({ ...bookingData, tripType: 'single' });
                          if (fareOptions.length > 0) handleFindRides('single');
                        }}
                        className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                          bookingData.tripType === 'single' ? 'bg-brand-primary shadow-xl text-white scale-105' : 'text-zinc-500 hover:text-brand-primary'
                        }`}
                      >
                        Single Trip
                      </button>
                      <button
                        onClick={() => {
                          setBookingData({ ...bookingData, tripType: 'round' });
                          if (fareOptions.length > 0) handleFindRides('round');
                        }}
                        className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                          bookingData.tripType === 'round' ? 'bg-brand-primary shadow-xl text-white scale-105' : 'text-zinc-500 hover:text-brand-primary'
                        }`}
                      >
                        Round Trip
                      </button>
                    </div>

                    <div className="space-y-4">
                      {(pickupCoords || dropoffCoords) && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full border border-zinc-200/80 rounded-2xl overflow-hidden shadow-inner relative z-0"
                        >
                          <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-100 flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider">
                            <span className="flex items-center gap-1">🗺️ Live Route Map</span>
                            {estimatedDistance && <span className="text-zinc-800 font-extrabold">{estimatedDistance} KM</span>}
                          </div>
                          <MapComponent 
                            pickup={pickupCoords} 
                            dropoff={dropoffCoords} 
                            onPickupChange={handleMapPickupChange}
                            onDropoffChange={handleMapDropoffChange}
                            onDistanceChange={handleMapDistanceChange}
                          />
                        </motion.div>
                      )}
                      
                      {isManualDetailedAddress ? (
                        <div className="space-y-4 p-5 bg-amber-50/50 border border-amber-200/50 rounded-3xl animate-in fade-in duration-300">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                              📝 DETAILED MANUAL BOOKING FORM
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsManualDetailedAddress(false);
                                setBookingData(prev => ({ ...prev, pickup: '', dropoff: '' }));
                                setPickupDetailed({ street: '', city: '', district: '', state: '' });
                                setDropoffDetailed({ street: '', city: '', district: '', state: '' });
                              }}
                              className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest bg-rose-50 px-2.5 py-1 rounded-xl cursor-pointer"
                            >
                              Cancel Manual Form
                            </button>
                          </div>

                          {/* PICKUP GROUP */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider ml-1 font-sans flex items-center gap-1">📍 Pickup Address Details</label>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Local Address / Landmark"
                                className="col-span-2 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={pickupDetailed.street}
                                onChange={e => setPickupDetailed(prev => ({ ...prev, street: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="City / Town"
                                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={pickupDetailed.city}
                                onChange={e => setPickupDetailed(prev => ({ ...prev, city: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="District"
                                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={pickupDetailed.district}
                                onChange={e => setPickupDetailed(prev => ({ ...prev, district: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="State"
                                className="col-span-2 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={pickupDetailed.state}
                                onChange={e => setPickupDetailed(prev => ({ ...prev, state: e.target.value }))}
                              />
                            </div>
                          </div>

                          {/* DROPOFF GROUP */}
                          <div className="space-y-2 pt-3 border-t border-amber-200/40">
                            <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-wider ml-1 font-sans flex items-center gap-1">🏁 Dropoff Address Details</label>
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Local Address / Landmark"
                                className="col-span-2 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={dropoffDetailed.street}
                                onChange={e => setDropoffDetailed(prev => ({ ...prev, street: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="City / Town"
                                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={dropoffDetailed.city}
                                onChange={e => setDropoffDetailed(prev => ({ ...prev, city: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="District"
                                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={dropoffDetailed.district}
                                onChange={e => setDropoffDetailed(prev => ({ ...prev, district: e.target.value }))}
                              />
                              <input
                                type="text"
                                placeholder="State"
                                className="col-span-2 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 animate-in"
                                value={dropoffDetailed.state}
                                onChange={e => setDropoffDetailed(prev => ({ ...prev, state: e.target.value }))}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <motion.div 
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="relative group"
                          >
                            <MapPin className="absolute left-4 top-4 w-5 h-5 text-emerald-500 group-focus-within:scale-110 transition-transform" />
                            <motion.input
                              whileFocus={{ scale: 1.01 }}
                              ref={pickupRef}
                              type="text"
                              placeholder="Pickup Location"
                              className="w-full pl-12 pr-12 py-4 bg-white/50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-brand-primary/5 focus:bg-white transition-all shadow-sm hover:shadow-md"
                              value={bookingData.pickup}
                              onChange={e => {
                                setBookingData({ ...bookingData, pickup: e.target.value });
                                setFareOptions([]);
                              }}
                              onBlur={() => {
                                geocodeLocation(bookingData.pickup, 'pickup');
                                autoCalculateDistance();
                              }}
                            />
                            <button 
                              onClick={getCurrentLocation}
                              disabled={isLiveLocationLoading}
                              className={`absolute right-4 top-4 transition-all ${isLiveLocationLoading ? 'text-zinc-400' : 'text-emerald-500 hover:text-emerald-600 hover:scale-110'}`}
                              title="Use Current Location"
                            >
                              {isLiveLocationLoading ? (
                                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                              ) : (
                                <Navigation className="w-5 h-5" />
                              )}
                            </button>
                          </motion.div>

                          <motion.div 
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="relative group"
                          >
                            <Navigation className="absolute left-4 top-4 w-5 h-5 text-rose-500 group-focus-within:scale-110 transition-transform" />
                            <motion.input
                              whileFocus={{ scale: 1.01 }}
                              ref={dropoffRef}
                              type="text"
                              placeholder="Dropoff Location"
                              className="w-full pl-12 pr-4 py-4 bg-white/50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:bg-white transition-all shadow-sm hover:shadow-md"
                              value={bookingData.dropoff}
                              onChange={e => {
                                setBookingData({ ...bookingData, dropoff: e.target.value });
                                setFareOptions([]);
                              }}
                              onBlur={() => {
                                geocodeLocation(bookingData.dropoff, 'dropoff');
                                autoCalculateDistance();
                              }}
                            />
                          </motion.div>

                          {showManualFormOption && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsManualDetailedAddress(true);
                                setFareOptions([]);
                              }}
                              className="w-full text-left px-4 py-3 bg-amber-50/70 hover:bg-amber-100/80 border border-amber-200/50 rounded-2xl text-[11px] font-bold text-amber-800 flex items-center justify-between transition-all cursor-pointer animate-in fade-in duration-300"
                            >
                              <span className="flex items-center gap-1.5 font-sans">🗺️ Unable to find location on search? Click here for Manual detailed Address Booking</span>
                              <span className="font-extrabold text-amber-950">&rarr;</span>
                            </button>
                          )}
                        </>
                      )}

                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="relative group"
                      >
                        <div className="absolute left-4 top-4 w-5 h-5 flex items-center justify-center text-zinc-400 font-black text-[10px] group-focus-within:scale-110 transition-transform">KM</div>
                        <motion.input
                          whileFocus={isManualDetailedAddress ? { scale: 1.01 } : {}}
                          type="number"
                          placeholder={isManualDetailedAddress ? "Enter total KM" : "Calculated automatically from map"}
                          className={`w-full pl-12 pr-4 py-4 border rounded-2xl focus:outline-none transition-all shadow-sm ${
                            isManualDetailedAddress 
                              ? "bg-white/50 border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:bg-white hover:shadow-md cursor-text" 
                              : "bg-zinc-100/90 border-zinc-200 text-zinc-600 font-extrabold cursor-not-allowed"
                          }`}
                          value={bookingData.manualDistance}
                          readOnly={!isManualDetailedAddress}
                          onChange={e => {
                            if (isManualDetailedAddress) {
                              setBookingData({ ...bookingData, manualDistance: e.target.value });
                              setFareOptions([]);
                            }
                          }}
                        />
                        {isManualDetailedAddress ? (
                          <div className="p-3 bg-amber-50/50 border border-amber-200/40 rounded-2xl text-[11px] text-amber-800 leading-normal font-sans mt-2">
                            💡 <strong>Please enter estimated distance in "Total KM" field above</strong> since manual addresses are not searchable on standard maps. Real fares will be estimated perfectly based on your entered KM.
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[10px] font-black text-indigo-600 mt-2 ml-2 uppercase tracking-widest font-sans">
                            <span className="animate-pulse">⚡</span> Auto-calculated from Live Route Map Directions
                          </div>
                        )}
                      </motion.div>

                      <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="grid grid-cols-2 gap-4"
                      >
                        <div className="relative group">
                          <Clock className="absolute left-4 top-4 w-4 h-4 text-zinc-400 group-focus-within:scale-110 transition-transform" />
                          <motion.input
                            whileFocus={{ scale: 1.02 }}
                            type="date"
                            className="w-full pl-10 pr-3 py-4 bg-white/50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:bg-white transition-all text-sm shadow-sm hover:shadow-md"
                            value={bookingData.pickupDate}
                            onChange={e => setBookingData({ ...bookingData, pickupDate: e.target.value })}
                          />
                        </div>
                        <div className="relative group">
                          <Clock className="absolute left-4 top-4 w-4 h-4 text-zinc-400 group-focus-within:scale-110 transition-transform" />
                          <motion.input
                            whileFocus={{ scale: 1.02 }}
                            type="time"
                            className="w-full pl-10 pr-3 py-4 bg-white/50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:bg-white transition-all text-sm shadow-sm hover:shadow-md"
                            value={bookingData.pickupTime}
                            onChange={e => setBookingData({ ...bookingData, pickupTime: e.target.value })}
                          />
                        </div>
                      </motion.div>

                      <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="relative group"
                      >
                        <Users className="absolute left-4 top-4 w-5 h-5 text-zinc-400 group-focus-within:scale-110 transition-transform" />
                        <motion.select
                          whileFocus={{ scale: 1.01 }}
                          className="w-full pl-12 pr-4 py-4 bg-white/50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:bg-white transition-all shadow-sm hover:shadow-md appearance-none"
                          value={bookingData.passengers}
                          onChange={e => {
                            setBookingData({ ...bookingData, passengers: e.target.value });
                            setFareOptions([]);
                          }}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                            <option key={num} value={num}>{num} Passenger{num > 1 ? 's' : ''}</option>
                          ))}
                        </motion.select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <ArrowRight className="w-4 h-4 text-zinc-400 rotate-90" />
                        </div>
                        <p className="text-[10px] font-bold text-zinc-400 mt-2 ml-2 uppercase tracking-widest">Select number of people</p>
                      </motion.div>
                    </div>

                    {fareOptions.length === 0 ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleFindRides()}
                        disabled={isEstimating || !bookingData.pickup || !bookingData.dropoff}
                        className="w-full bg-brand-primary text-white py-5 rounded-3xl font-black shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 btn-3d relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity" />
                        {isEstimating ? (
                          <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <Search className="w-6 h-6" />
                            <span className="text-lg">Find Best Rides</span>
                          </>
                        )}
                      </motion.button>
                    ) : (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {estimatedDistance && (
                          <div className="flex flex-col gap-2 p-4 bg-zinc-50 border border-zinc-200/60 rounded-2xl text-xs">
                            <p className="font-extrabold flex items-center gap-1 text-zinc-800">
                              <span>⚠️</span> EXTRA KM RATE POLICY
                            </p>
                            <p className="font-medium text-zinc-500 leading-relaxed">
                              This booking covers the estimated route distance of <strong className="text-zinc-800">{estimatedDistance} KM</strong>. Any additional KM traveled during the ride will be charged extra on trip completion based on the vehicle rate.
                            </p>
                          </div>
                        )}
                        
                        {estimatedDistance && (
                          <div className="flex items-center justify-between px-3 py-2 text-sm bg-zinc-50 rounded-lg border border-zinc-100">
                            <div className="flex items-center gap-2 text-zinc-500">
                              <Navigation className="w-4 h-4" />
                              <span>Distance: <span className="text-zinc-900 font-bold">{estimatedDistance} km</span></span>
                            </div>
                            <div className="text-zinc-500">
                              Trip: <span className="text-zinc-900 font-bold capitalize">{bookingData.tripType}</span>
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-1 gap-4">
                          {fareOptions.filter(option => option.seats >= parseInt(bookingData.passengers)).length === 0 ? (
                            <div className="p-8 text-center bg-rose-50 rounded-2xl border border-rose-100 space-y-2">
                              <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                              <p className="text-sm font-bold text-rose-900">No Vehicles Available</p>
                              <p className="text-xs text-rose-600">We don't have vehicles that can accommodate {bookingData.passengers} passengers. Please try a smaller group or multiple bookings.</p>
                            </div>
                          ) : (
                            fareOptions
                              .filter(option => option.seats >= parseInt(bookingData.passengers))
                              .map((option, idx) => (
                              <motion.button
                                key={option.type}
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.1 }}
                                onClick={() => handleBookRide(option)}
                                className={`flex items-center justify-between p-2 rounded-2xl border-2 transition-all relative overflow-hidden group ${
                                  selectedOption?.type === option.type 
                                  ? 'border-brand-primary bg-brand-primary text-white shadow-2xl -translate-y-0.5' 
                                  : 'glass p-2 hover:border-zinc-300 hover:-translate-y-0.5 shadow-sm hover:shadow-md'
                                }`}
                              >
                                {selectedOption?.type === option.type && (
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/10 to-transparent rounded-full -mr-16 -mt-16 blur-2xl" />
                                )}
                                <div className="flex items-center gap-2 relative z-10">
                                  <div className={`p-1 rounded-lg transition-colors ${selectedOption?.type === option.type ? 'bg-white/20' : 'bg-zinc-100'}`}>
                                    <Car className={`w-4 h-4 ${selectedOption?.type === option.type ? 'text-white' : 'text-zinc-900'}`} />
                                  </div>
                                  <div className="text-left font-sans">
                                    <div className="flex items-center gap-1">
                                      <p className="font-black text-xs">{option.type}</p>
                                      <span className={`text-[7px] px-1 py-0.5 rounded-full font-black uppercase tracking-widest ${selectedOption?.type === option.type ? 'bg-white/20 text-white' : 'bg-zinc-200 text-zinc-600'}`}>
                                        {option.seats} Seater
                                      </span>
                                    </div>
                                    <p className={`text-[8px] font-medium ${selectedOption?.type === option.type ? 'text-zinc-400' : 'text-zinc-500'}`}>Available • 2-5 min away</p>
                                  </div>
                                </div>
                                <div className="text-right relative z-10">
                                  <p className="text-base font-black">₹{option.fare}</p>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-[7px] font-black text-emerald-500 uppercase tracking-tighter bg-emerald-50 px-1 rounded">
                                      ₹{Math.round(option.fare * 0.1)} Advance
                                    </span>
                                    {option.discount > 0 && (
                                      <p className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">
                                        Saved ₹{option.discount}
                                      </p>
                                    )}
                                  </div>
                                  <p className={`text-[7px] font-bold uppercase tracking-widest ${selectedOption?.type === option.type ? 'text-zinc-500' : 'text-zinc-400'}`}>Incl. taxes</p>
                                </div>
                              </motion.button>
                            ))
                          )}
                        </div>
                        {/* Removed passenger free ride section */}
                        {/* Direct payment on vehicle selection */}
                      </div>
                    )}
                  </motion.div>

                  {myRides.length > 0 && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <div className="p-1.5 bg-indigo-100 rounded-lg">
                          <Clock className="w-5 h-5 text-indigo-600" />
                        </div>
                        <span className="gradient-text">Your Booking History</span>
                      </h2>
                      <div className="grid grid-cols-1 gap-4">
                        {myRides.map(ride => (
                          <motion.div 
                            key={ride.id} 
                            whileHover={{ scale: 1.01 }}
                            className="glass p-6 rounded-[2rem] space-y-4 relative overflow-hidden group"
                          >
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/5 to-rose-500/5 rounded-full -mr-12 -mt-12 blur-xl group-hover:scale-150 transition-transform duration-700" />
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-zinc-400 uppercase">Tracking ID: {ride.tracking_id}</p>
                                <p className="font-bold">{ride.pickup_location} → {ride.dropoff_location}</p>
                                {ride.driver_name && (
                                  <div className="mt-2 p-2 bg-zinc-50 rounded-lg border border-zinc-100 flex items-center gap-2">
                                    <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center">
                                      <User className="w-4 h-4 text-zinc-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold">{ride.driver_name}</p>
                                      <p className="text-xs text-zinc-500">{ride.driver_phone} • {ride.vehicle_type} • {ride.plate_number}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(ride.status)}`}>
                                {getStatusLabel(ride.status, ride.advance_paid)}
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {ride.trip_type === 'round' ? (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">Round Trip</span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700">Single Trip</span>
                                )}
                                {ride.discount && ride.discount > 0 && (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">₹{ride.discount} Saved</span>
                                )}
                                {ride.distance && (
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase">{ride.distance} KM</span>
                                )}
                                {(ride as any).passengers && (
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {(ride as any).passengers} Pax
                                  </span>
                                )}
                                {ride.pickup_date && (
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> {ride.pickup_date} {ride.pickup_time}
                                  </span>
                                )}
                                {ride.advance_paid && (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700">₹{ride.advance_paid} Advance Paid</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {(ride.status === 'accepted' || ride.status === 'ongoing') && !ride.complaint && (
                                  <button
                                    onClick={() => {
                                      const hasUnresolved = myRides.some(r => r.complaint && (r.complaint_status === 'pending' || r.complaint_status === 'forwarded'));
                                      if (hasUnresolved) {
                                        setToast({ message: "You already have an active complaint. Please wait for it to be resolved.", type: 'error' });
                                      } else {
                                        setComplaintModal({ rideId: ride.id, trackingId: ride.tracking_id, driverPhone: ride.driver_phone });
                                      }
                                    }}
                                    className="flex items-center gap-1 text-rose-600 text-[10px] font-bold hover:underline bg-rose-50 px-2 py-1 rounded-lg border border-rose-100"
                                  >
                                    <AlertCircle className="w-3 h-3" /> Complaint
                                  </button>
                                )}
                                {ride.status === 'completed' && !ride.rating && (
                                  <button
                                    onClick={() => setReviewModal({ rideId: ride.id, driverName: ride.driver_name || 'Driver' })}
                                    className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold hover:underline bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"
                                  >
                                    <Star className="w-3 h-3" /> Rate & Review
                                  </button>
                                )}
                              </div>
                            </div>
                            {ride.rating && (
                              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
                                <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs mb-1">
                                  <Star className="w-3 h-3 fill-current" /> {ride.rating}/5 Rating Given
                                </div>
                                {ride.review && <p className="text-xs text-zinc-600 italic">"{ride.review}"</p>}
                              </div>
                            )}
                            {ride.complaint && (
                              <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100/50">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> Your Complaint
                                  </p>
                                  <div className="flex items-center gap-2">
                                    {ride.complaint_status === 'forwarded' && ride.complaint_forwarded_to_admin_name && (
                                      <span className="text-[8px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-bold uppercase">Forwarded to {ride.complaint_forwarded_to_admin_name}</span>
                                    )}
                                    {ride.complaint_forwarded_to_driver && (
                                      <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-bold uppercase">Forwarded to Driver</span>
                                    )}
                                    <span className={`text-[8px] font-bold uppercase ${ride.complaint_status === 'resolved' ? 'text-emerald-600' : ride.complaint_status === 'forwarded' ? 'text-amber-600' : 'text-rose-500'}`}>
                                      {ride.complaint_status || 'pending'}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-xs text-zinc-600 italic">"{ride.complaint}"</p>
                                {ride.complaint_user_reply && (
                                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Response from {ride.complaint_admin_name || 'Admin'}:</p>
                                    <p className="text-xs text-emerald-700 italic">{ride.complaint_user_reply}</p>
                                  </div>
                                )}
                                {ride.complaint_driver_response && (
                                  <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                                    <p className="text-[10px] font-bold text-indigo-600 uppercase">Response from Driver:</p>
                                    <p className="text-xs text-indigo-700 italic">{ride.complaint_driver_response}</p>
                                  </div>
                                )}
                                {ride.complaint_reply && !ride.complaint_user_reply && (
                                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Response from Admin:</p>
                                    <p className="text-xs text-emerald-700 italic">{ride.complaint_reply}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {ride.status === 'cancelled' && ride.cancellation_reason && (
                              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                                <p className="text-[10px] font-bold text-rose-600 uppercase">Cancellation Reason</p>
                                <p className="text-xs text-rose-700 italic">"{ride.cancellation_reason}"</p>
                              </div>
                            )}
                            {ride.status === 'accepted' && (
                              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                                <p className="text-xs font-bold text-emerald-600 uppercase">Driver is arriving</p>
                                <p className="text-sm font-bold text-emerald-700">ETA: {ride.eta || 'Calculating...'} mins</p>
                              </div>
                            )}
                            {(ride.status === 'pending' || ride.status === 'accepted') && (
                              <button
                                onClick={() => handleUserCancelRide(ride.id)}
                                className="text-rose-600 text-sm font-bold hover:underline"
                              >
                                Cancel Ride
                              </button>
                            )}
                            {ride.status !== 'cancelled' && ride.status !== 'completed' && (
                              <div className="grid grid-cols-2 gap-4 pt-2">
                                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Start OTP</p>
                                  <p className="text-lg font-mono font-bold text-zinc-900">{ride.start_otp || '----'}</p>
                                </div>
                                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">End OTP</p>
                                  <p className="text-lg font-mono font-bold text-zinc-900">{ride.end_otp || '----'}</p>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="bg-brand-dark text-white p-6 rounded-2xl shadow-lg space-y-4 mt-8">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <Search className="w-5 h-5" /> Track Any Ride
                    </h2>
                    <div className="flex flex-col gap-3">
                      <input
                        type="text"
                        placeholder="Enter Tracking ID (e.g. ABC123XY)"
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-white/50 text-lg placeholder:text-white/30"
                        value={trackingId}
                        onChange={e => setTrackingId(e.target.value)}
                      />
                      <button
                        onClick={handleTrackRide}
                        className="w-full bg-white text-zinc-900 py-4 rounded-xl font-bold hover:bg-zinc-100 transition-all flex items-center justify-center gap-2"
                      >
                        <Search className="w-5 h-5" />
                        Track Ride
                      </button>
                    </div>
                  </div>

              {trackedRide && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Tracking ID</span>
                      <p className="text-2xl font-mono font-bold">{trackedRide.tracking_id}</p>
                      {trackedRide.pickup_date && (
                        <p className="text-xs font-bold text-emerald-600 uppercase mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pickup: {trackedRide.pickup_date} {trackedRide.pickup_time}
                        </p>
                      )}
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(trackedRide.status)}`}>
                      {getStatusLabel(trackedRide.status, trackedRide.advance_paid)}
                    </div>
                  </div>

                  {trackedRide.status === 'cancelled' && trackedRide.cancellation_reason && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                      <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-1">Cancellation Reason</p>
                      <p className="text-sm text-rose-700 italic font-medium">"{trackedRide.cancellation_reason}"</p>
                    </div>
                  )}

                  {trackedRide.status === 'accepted' && trackedRide.eta && (
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-3">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <div>
                        <p className="text-xs font-bold text-blue-700 uppercase">Driver arriving in</p>
                        <p className="text-xl font-bold text-blue-900">{trackedRide.eta} Minutes</p>
                      </div>
                    </div>
                  )}

                  {/* Live Ride Map View */}
                  {(trackedPickupCoords || trackedDropoffCoords) && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full border border-zinc-200/80 rounded-2xl overflow-hidden shadow-inner relative z-0"
                    >
                      <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-100 flex items-center justify-between text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <span className="flex items-center gap-1">🗺️ Live Ride Route</span>
                        {trackedRide.actual_distance ? (
                          <span className="text-zinc-800 font-extrabold">Driven: {trackedRide.actual_distance} KM</span>
                        ) : (
                          trackedRide.distance && <span className="text-zinc-800 font-extrabold">{trackedRide.distance} KM max</span>
                        )}
                      </div>
                      <MapComponent pickup={trackedPickupCoords} dropoff={trackedDropoffCoords} />
                    </motion.div>
                  )}

                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        <div className="w-0.5 h-full bg-zinc-200" />
                        <div className="w-3 h-3 rounded-full bg-brand-primary" />
                      </div>
                      <div className="flex-1 space-y-4">
                        <div>
                          <p className="text-xs text-zinc-400 font-bold uppercase">Pickup</p>
                          <p className="font-medium">{trackedRide.pickup_location}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-400 font-bold uppercase">Dropoff</p>
                          <p className="font-medium">{trackedRide.dropoff_location}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {trackedRide.status !== 'cancelled' && trackedRide.status !== 'completed' && (
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Start OTP</p>
                        <p className="text-lg font-mono font-bold text-zinc-900">{trackedRide.start_otp || '----'}</p>
                      </div>
                      <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">End OTP</p>
                        <p className="text-lg font-mono font-bold text-zinc-900">{trackedRide.end_otp || '----'}</p>
                      </div>
                    </div>
                  )}

                  {trackedRide.driver_name && (
                    <div className="pt-6 border-t border-zinc-100 space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-zinc-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold">{trackedRide.driver_name}</p>
                          <p className="text-sm text-zinc-500">{trackedRide.vehicle_type} • {trackedRide.plate_number}</p>
                          {trackedRide.driver_phone && (
                            <a href={`tel:${trackedRide.driver_phone}`} className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-1">
                              <Phone className="w-3 h-3" /> {trackedRide.driver_phone}
                            </a>
                          )}
                        </div>
                        <div className="text-right font-sans">
                          <p className="text-[10px] text-zinc-400 font-bold uppercase">Fare Details</p>
                          {trackedRide.extra_charge && trackedRide.extra_charge > 0 ? (
                            <div className="flex flex-col items-end gap-0.5 mt-1">
                              <span className="text-[10px] text-zinc-400">Base Fare: ₹{trackedRide.fare}</span>
                              <span className="text-[10px] text-zinc-600 font-extrabold text-amber-600">Extra: +₹{trackedRide.extra_charge}</span>
                              <p className="text-lg font-black text-neutral-800">₹{trackedRide.final_total_fare}</p>
                            </div>
                          ) : (
                            <p className="text-lg font-bold">₹{trackedRide.fare}</p>
                          )}
                          {trackedRide.discount && trackedRide.discount > 0 && (
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">Saved ₹{trackedRide.discount}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Start OTP</p>
                          <p className="text-2xl font-mono font-bold text-zinc-900">{trackedRide.start_otp || '----'}</p>
                          <p className="text-[10px] text-zinc-400 mt-1">Share to start ride</p>
                        </div>
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">End OTP</p>
                          <p className="text-2xl font-mono font-bold text-zinc-900">{trackedRide.end_otp || '----'}</p>
                          <p className="text-[10px] text-zinc-400 mt-1">Share to end ride</p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )}
        </motion.div>
          )}

          {/* ADMIN VIEW */}
          {view === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
                  {!user ? (
                    <motion.div 
                      initial={{ rotateY: -20, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      className="max-w-md mx-auto glass p-10 rounded-[2.5rem] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-rose-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                      <h2 className="text-2xl sm:text-3xl font-black mb-8 flex items-center gap-3">
                        <div className="p-2 bg-brand-primary rounded-xl shadow-lg shrink-0">
                          <ShieldCheck className="text-white w-6 h-6" /> 
                        </div>
                        <span className="gradient-text truncate">Admin Login</span>
                      </h2>
                      {error && (
                        <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
                          {error}
                          <button onClick={() => setError('')} className="float-right"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                      
                      <form onSubmit={handleAdminLogin} className="space-y-4">
                          {adminLoginStep === 'credentials' ? (
                            <>
                              <input
                                type="text"
                                placeholder="Username"
                                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                value={loginData.username}
                                onChange={e => setLoginData({ ...loginData, username: e.target.value })}
                              />
                              <input
                                type="password"
                                placeholder="Password"
                                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                value={loginData.password}
                                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                              />
                            </>
                          ) : (
                            <div className="space-y-4">
                              <div className="p-4 bg-brand-primary text-white rounded-xl text-center">
                                <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Step 2</p>
                                <p className="text-sm">Enter Secure PIN</p>
                              </div>
                              <input
                                type="password"
                                placeholder="2nd Step PIN"
                                maxLength={4}
                                autoFocus
                                className="w-full px-4 py-4 bg-zinc-50 border border-zinc-200 rounded-xl text-center text-2xl font-bold tracking-[1em] focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                value={adminPin}
                                onChange={e => setAdminPin(e.target.value.replace(/\D/g, ''))}
                              />
                            </div>
                          )}
                          
                          <button className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg">
                            {adminLoginStep === 'credentials' ? 'Continue' : 'Verify & Login'}
                          </button>
                          
                          {adminLoginStep === 'pin' && (
                            <button 
                              type="button"
                              onClick={() => setAdminLoginStep('credentials')}
                              className="w-full text-sm font-medium text-zinc-500 hover:text-zinc-900"
                            >
                              Back to Credentials
                            </button>
                          )}
                          
                          <div className="pt-4 border-t border-zinc-100 text-center">
                            <button 
                              type="button"
                              onClick={() => setView('user')}
                              className="text-xs font-bold text-zinc-400 hover:text-zinc-900 uppercase tracking-wider"
                            >
                              Back to User Login
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    ) : (
                      user?.role === 'admin' || user?.role === 'owner' ? (
                      <div className="space-y-8">
                        <div className="flex items-center justify-between mb-8">
                          <div className="space-y-1">
                            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter gradient-text">Admin Command Center</h1>
                            <p className="text-zinc-500 text-sm font-medium flex items-center gap-2">
                              Welcome, <span className="font-black gradient-text">{user.username || user.name || 'Admin'}!</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-2 glass rounded-2xl">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-xs font-black uppercase tracking-widest">System Live</span>
                          </div>
                        </div>

                        {/* Global Search Bar */}
                        <div className="bg-white p-4 rounded-3xl border border-zinc-200 shadow-sm sticky top-20 z-40">
                          <div className="flex flex-col sm:flex-row gap-3">
                            <div className="relative min-w-[160px]">
                              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                              <select 
                                value={searchCategory}
                                onChange={e => setSearchCategory(e.target.value)}
                                className="w-full pl-10 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-zinc-900 appearance-none cursor-pointer"
                              >
                                <option value="all">All Data</option>
                                <option value="rides">Rides</option>
                                <option value="drivers">Drivers</option>
                                <option value="users">Users</option>
                                <option value="withdrawals">Withdrawals</option>
                                <option value="notifications">Notifications</option>
                              </select>
                            </div>
                            <div className="relative flex-1">
                              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                              <input 
                                type="text"
                                placeholder={`Search in ${searchCategory === 'all' ? 'everything' : searchCategory}...`}
                                className="w-full pl-12 pr-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 font-medium"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {(user.role === 'owner' || user.permissions?.rides || user.permissions?.drivers) && [
                            { label: 'Total Rides', value: adminRides.length, color: 'from-blue-500 to-indigo-600', icon: Car, show: user.role === 'owner' || user.permissions?.rides },
                            { label: 'Active Drivers', value: adminDrivers.filter(d => d.status === 'active').length, color: 'from-orange-500 to-rose-600', icon: Users, show: user.role === 'owner' || user.permissions?.drivers },
                            { label: 'Total Revenue', value: `₹${adminRides.reduce((acc, r) => acc + r.fare, 0)}`, color: 'from-emerald-500 to-teal-600', icon: IndianRupee, show: user.role === 'owner' || user.permissions?.rides },
                            { label: 'Memory Usage', value: memoryInfo ? `${memoryInfo.heapUsed}MB / ${memoryInfo.limit}MB` : 'Loading...', color: 'from-purple-500 to-pink-600', icon: Activity, show: user.role === 'owner' }
                          ].filter(s => s.show).map((stat, i) => (
                            <motion.div 
                              key={i}
                              initial={{ y: 20, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              whileHover={{ y: -5, scale: 1.02 }}
                              transition={{ delay: i * 0.1 }}
                              className="glass p-8 rounded-3xl relative overflow-hidden group transition-all cursor-default"
                            >
                              <div className={`absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity`} />
                              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.color} opacity-10 rounded-full -mr-12 -mt-12 blur-2xl group-hover:scale-150 transition-all`} />
                              <stat.icon className="w-6 h-6 text-zinc-400 mb-4 group-hover:text-zinc-900 transition-colors" />
                              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{stat.label}</p>
                              <p className="text-3xl font-black tracking-tighter mt-1">{stat.value}</p>
                            </motion.div>
                          ))}
                        </div>

                        {user.role === 'owner' && (
                          <div className="bg-zinc-900 text-white p-3 rounded-2xl relative overflow-hidden shadow-xl border border-white/10">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 blur-2xl" />
                            <div className="relative z-10">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                                <div className="space-y-0.5">
                                  <h3 className="text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 text-zinc-400">
                                    <Settings className="w-2.5 h-2.5 text-emerald-400" />
                                    System Health
                                  </h3>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 w-full sm:w-auto">
                                  <div className="text-center p-1.5 bg-white/5 rounded-lg border border-white/10">
                                    <p className="text-[6px] uppercase font-black tracking-widest text-zinc-500">Rides</p>
                                    <p className="text-[10px] font-black">{adminRides.length}</p>
                                  </div>
                                  <div className="text-center p-1.5 bg-white/5 rounded-lg border border-white/10">
                                    <p className="text-[6px] uppercase font-black tracking-widest text-zinc-500">Users</p>
                                    <p className="text-[10px] font-black">{adminUsers.length}</p>
                                  </div>
                                  <div className="text-center p-1.5 bg-white/5 rounded-lg border border-white/10">
                                    <p className="text-[6px] uppercase font-black tracking-widest text-zinc-500">Memory</p>
                                    <p className="text-[10px] font-black text-emerald-400">
                                      {memoryInfo ? `${Math.round((memoryInfo.heapUsed / memoryInfo.limit) * 100)}%` : '...'}%
                                    </p>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="space-y-2 bg-white/5 p-3 rounded-xl border border-white/10">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                                    <p className="text-[8px] uppercase font-black tracking-widest text-zinc-400">Database Storage (Docs)</p>
                                  </div>
                                  <p className="text-[8px] font-black text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-md">
                                    {(adminRides.length + adminUsers.length + adminDrivers.length)} / 20,000,000 Docs (~40GB)
                                  </p>
                                </div>
                                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (adminRides.length + adminUsers.length + adminDrivers.length) / 200000)}%` }}
                                    className="bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 h-full rounded-full"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {user.role === 'owner' && (
                          <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="glass rounded-[2.5rem] overflow-hidden border border-zinc-200 shadow-xl"
                          >
                            <div className="p-6 bg-zinc-900 text-white flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/10 rounded-xl">
                                  <Activity className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                  <h3 className="font-bold text-lg leading-tight">Admin Activity Logs</h3>
                                  <p className="text-zinc-400 text-[10px] font-black uppercase tracking-widest">Real-time tracking of admin actions</p>
                                </div>
                              </div>
                              <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">
                                {activities.length} Logs
                              </div>
                            </div>
                            <div className="p-6">
                              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {activities.length === 0 ? (
                                  <div className="text-center py-10 text-zinc-400 italic text-sm">No activities logged yet.</div>
                                ) : (
                                  activities.map((log, i) => (
                                    <motion.div 
                                      key={log.id}
                                      initial={{ x: -10, opacity: 0 }}
                                      animate={{ x: 0, opacity: 1 }}
                                      transition={{ delay: i * 0.05 }}
                                      className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-white hover:shadow-md transition-all"
                                    >
                                      <div className="flex items-start gap-3">
                                        <div className="p-2 bg-zinc-200 rounded-xl group-hover:bg-brand-primary/10 group-hover:text-brand-primary transition-colors">
                                          <User className="w-4 h-4" />
                                        </div>
                                        <div>
                                          <p className="text-sm font-bold text-zinc-900">{log.admin_name} <span className="text-zinc-400 font-medium text-xs">({log.admin_role})</span></p>
                                          <p className="text-xs font-black text-brand-primary uppercase tracking-widest mt-0.5">{log.action}</p>
                                          <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <p className="text-xs text-zinc-500">{log.details}</p>
                                            {log.target_id && log.target_type && (
                                              <button 
                                                onClick={() => handleViewActivityDetails(log)}
                                                className="text-[10px] bg-brand-primary/10 text-brand-primary px-2 py-0.5 rounded-full font-black uppercase tracking-widest hover:bg-brand-primary hover:text-white transition-all flex items-center gap-1"
                                              >
                                                <Eye className="w-2.5 h-2.5" />
                                                View Profile
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0 flex flex-col items-end gap-2">
                                        <div>
                                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{new Date(log.timestamp).toLocaleDateString()}</p>
                                          <p className="text-xs font-bold text-zinc-900">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                        {user.role === 'owner' && (
                                          <button 
                                            onClick={() => handleDeleteActivity(log.id)}
                                            className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-lg transition-all"
                                            title="Delete Activity"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </motion.div>
                                  ))
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}

                  {user.role === 'owner' && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100">
                        <h3 className="font-bold text-lg">Manage Admins</h3>
                      </div>
                      <div className="p-6 space-y-4">
                        <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Admin Username"
                            className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={newAdmin.username}
                            onChange={e => setNewAdmin({ ...newAdmin, username: e.target.value })}
                          />
                          <input
                            type="password"
                            placeholder="Password"
                            className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={newAdmin.password}
                            onChange={e => setNewAdmin({ ...newAdmin, password: e.target.value })}
                          />
                          <input
                            type="text"
                            maxLength={4}
                            placeholder="2nd Step PIN"
                            required
                            className="w-24 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={newAdmin.pin}
                            onChange={e => setNewAdmin({ ...newAdmin, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          />
                          <select 
                            className="px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={newAdmin.role}
                            onChange={e => setNewAdmin({ ...newAdmin, role: e.target.value as 'admin' | 'owner' })}
                          >
                            <option value="admin">Admin</option>
                            {user.username === 'Shafiq Choudhary' && (
                              <option value="owner">Owner</option>
                            )}
                          </select>
                          <button className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-bold">Add Admin</button>
                        </form>
                        
                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-3">
                          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Admin Permissions</p>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {Object.entries(newAdmin.permissions).map(([key, value]) => (
                              <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                <input 
                                  type="checkbox" 
                                  checked={value}
                                  onChange={(e) => setNewAdmin({
                                    ...newAdmin,
                                    permissions: { ...newAdmin.permissions, [key]: e.target.checked }
                                  })}
                                  className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                                />
                                <span className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 capitalize">{key}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="divide-y divide-zinc-100">
                          {otherAdmins.map(admin => (
                            <div key={admin.id} className="py-3 flex justify-between items-center">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{admin.username}</span>
                                  <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded uppercase font-bold text-zinc-500">{admin.role}</span>
                                  <span className="text-[9px] text-zinc-400 font-medium">Joined: {admin.created_at ? new Date(admin.created_at).toLocaleString('en-IN') : '---'}</span>
                                </div>
                                {admin.permissions && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(admin.permissions).filter(([_, v]) => v).map(([k]) => (
                                      <span key={k} className="text-[8px] bg-zinc-50 text-zinc-400 px-1 py-0.5 rounded uppercase font-bold">{k}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-4">
                                {user.role === 'owner' && admin.id !== user.id && (
                                  <button 
                                    onClick={() => handleDeleteAdmin(admin.id)}
                                    className="p-2 hover:bg-rose-50 rounded-lg transition-all group"
                                  >
                                    <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-rose-600" />
                                  </button>
                                )}
                                {user.role === 'owner' && (admin.role !== 'owner' || user.username === 'Shafiq Choudhary') && admin.id !== user.id && (
                                  <button 
                                    onClick={() => setEditingAdmin(admin)}
                                    className="p-2 hover:bg-zinc-100 rounded-lg transition-all"
                                  >
                                    <Settings className="w-4 h-4 text-zinc-400" />
                                  </button>
                                )}
                                {admin.role === 'owner' && user.username !== 'Shafiq Choudhary' && (
                                  <span className="text-zinc-400 text-[10px] font-bold uppercase italic">Protected</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {user.role === 'owner' && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-zinc-900" />
                        <h3 className="font-bold text-lg">Security Settings</h3>
                      </div>
                      <div className="p-6">
                        <form onSubmit={handleChangeAdminCreds} className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="password"
                            placeholder="New Password"
                            required
                            className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={changeCreds.password}
                            onChange={e => setChangeCreds({ ...changeCreds, password: e.target.value })}
                          />
                          <input
                            type="text"
                            maxLength={4}
                            placeholder="New 2nd Step PIN"
                            required
                            className="w-32 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                            value={changeCreds.pin}
                            onChange={e => setChangeCreds({ ...changeCreds, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                          />
                          <button className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm font-bold">Update Credentials</button>
                        </form>
                      </div>
                    </div>
                  )}

                  {(user.role === 'owner' || user.permissions?.notifications) && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-zinc-900" />
                        <h3 className="font-bold text-lg">Send Notification</h3>
                      </div>
                      <div className="p-6 space-y-4">
                      <form onSubmit={handleSendNotification} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Target Audience</label>
                            <select 
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                              value={newNotification.target}
                              onChange={e => setNewNotification({ ...newNotification, target: e.target.value as Notification['target'] })}
                            >
                              <option value="all_drivers">All Drivers</option>
                              <option value="all_users">All Customers</option>
                              <option value="specific_driver">Specific Driver</option>
                              <option value="specific_user">Specific User</option>
                            </select>
                          </div>
                          {newNotification.target === 'specific_driver' && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Select Driver</label>
                              <select 
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                value={newNotification.driver_id}
                                onChange={e => setNewNotification({ ...newNotification, driver_id: e.target.value })}
                                required
                              >
                                <option value="">Select a driver...</option>
                                {adminDrivers.map(d => (
                                  <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {newNotification.target === 'specific_user' && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Select User</label>
                              <select 
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                                value={newNotification.user_id}
                                onChange={e => setNewNotification({ ...newNotification, user_id: e.target.value })}
                                required
                              >
                                <option value="">Select a user...</option>
                                {adminUsers.map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Message</label>
                          <textarea
                            placeholder="Write your notification message here..."
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 min-h-[100px]"
                            value={newNotification.message}
                            onChange={e => setNewNotification({ ...newNotification, message: e.target.value })}
                            required
                          />
                        </div>
                        <button 
                          disabled={isSendingNotification}
                          className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSendingNotification ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          Send Notification
                        </button>
                      </form>

                      {/* Sent Notifications List */}
                      <div className="mt-8 pt-8 border-t border-zinc-100">
                        <h4 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4">Sent Notifications</h4>
                        <div className="space-y-3">
                          {filteredNotifications.length === 0 ? (
                            <p className="text-center text-zinc-500 py-4 text-sm">No notifications found.</p>
                          ) : (
                            filteredNotifications.map(notif => (
                              <div key={notif.id} className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 flex justify-between items-start gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                      notif.target === 'all_drivers' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                      notif.target === 'all_users' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                      'bg-zinc-100 text-zinc-600 border-zinc-200'
                                    }`}>
                                      {notif.target.replace('_', ' ')}
                                    </span>
                                    <span className="text-[10px] text-zinc-400 font-medium">
                                      {new Date(notif.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-sm text-zinc-700 leading-relaxed">{notif.message}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => {
                                      setEditingNotification(notif);
                                      setIsEditingNotificationModalOpen(true);
                                    }}
                                    className="p-2 hover:bg-white rounded-xl transition-all border border-transparent hover:border-zinc-200 shadow-sm"
                                  >
                                    <Edit2 className="w-4 h-4 text-zinc-400 hover:text-zinc-900" />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteNotification(notif.id)}
                                    className="p-2 hover:bg-rose-50 rounded-xl transition-all border border-transparent hover:border-rose-200 shadow-sm group"
                                  >
                                    <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-rose-600" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {(user.role === 'owner' && configStatus && !configStatus.razorpay_key_secret) && (
                    <div className="bg-white rounded-2xl border border-rose-200 overflow-hidden mb-8">
                      <div className="p-6 border-b border-rose-100 bg-rose-50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg text-rose-900">System Configuration Check</h3>
                          <span className="bg-rose-100 text-rose-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                            Action Required
                          </span>
                        </div>
                        <Settings className="w-5 h-5 text-rose-400" />
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <div>
                            <p className="font-bold text-sm">Razorpay Key ID</p>
                            <p className="text-xs text-zinc-500 font-mono">rzp_live_SYhQAJjpxJPo6G</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-xs font-bold text-emerald-600 uppercase">Configured</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                          <div>
                            <p className="font-bold text-sm">Razorpay Secret Key</p>
                            <p className="text-xs text-zinc-500">Required for creating payment orders and verifying transactions.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            <span className="text-xs font-bold text-rose-600 uppercase">Missing</span>
                          </div>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                          <p className="text-xs text-amber-800 leading-relaxed">
                            <span className="font-bold">How to fix:</span> Go to the <span className="font-bold">Settings</span> menu (gear icon) in the top right of the AI Studio interface, select <span className="font-bold">Secrets</span>, and add a new secret named <code className="bg-amber-100 px-1 rounded text-rose-700 font-mono">RAZORPAY_KEY_SECRET</code> with your actual Razorpay Secret Key.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {(user.role === 'owner' || user.permissions?.withdrawals) && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg">Withdrawal Requests</h3>
                        <span className="bg-zinc-100 text-zinc-600 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                          {adminWithdrawals.filter(w => w.status === 'pending').length} Pending
                        </span>
                      </div>
                      <div className="divide-y divide-zinc-100">
                      {filteredWithdrawals.length === 0 ? (
                        <p className="p-6 text-center text-zinc-500 text-sm">No withdrawal requests.</p>
                      ) : (
                        filteredWithdrawals.map(req => (
                          <div key={req.id} className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold">{req.driver_name}</p>
                              <p className="text-sm text-zinc-500">{req.driver_phone}</p>
                              {req.bank_details && (
                                <p className="text-[10px] text-zinc-400 bg-zinc-50 p-1 rounded mt-1 border border-zinc-100">
                                  Bank: {req.bank_details}
                                </p>
                              )}
                              <p className="text-lg font-bold text-rose-600">₹{req.amount}</p>
                            </div>
                            <div className="flex gap-2">
                              {req.status === 'pending' ? (
                                <>
                                  <button 
                                    onClick={() => handleWithdrawalAction(req.id, 'approved')}
                                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700"
                                  >
                                    Approve
                                  </button>
                                  <button 
                                    onClick={() => handleWithdrawalAction(req.id, 'rejected')}
                                    className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                  req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                }`}>
                                  {req.status}
                                </span>
                              )}
                              <button 
                                onClick={() => handleDeleteWithdrawal(req.id)}
                                className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                                title="Delete Request"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  )}

                  {(user.role === 'owner' || user.permissions?.users) && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg">Manage Users</h3>
                        <User className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="divide-y divide-zinc-100">
                      {filteredUsers.length === 0 ? (
                        <p className="p-6 text-center text-zinc-500 text-sm">No users found.</p>
                      ) : (
                        filteredUsers.map(u => (
                          <div key={u.id} className="p-4 flex items-center justify-between">
                            <div>
                              <p className="font-bold">{u.name}</p>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-zinc-500">{u.phone}</p>
                                <span className="text-[10px] text-zinc-400 font-medium border-l border-zinc-200 pl-2">Registered: {u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : '---'}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {user.role === 'owner' && (
                                <>
                                  <button 
                                    onClick={() => setEditingUser(u)}
                                    className="p-2 hover:bg-zinc-100 rounded-lg transition-all"
                                  >
                                    <Settings className="w-4 h-4 text-zinc-400" />
                                  </button>
                                  {user.role === 'owner' && (
                                    <button 
                                      onClick={() => handleDeleteUser(u.id)}
                                      className="p-2 hover:bg-rose-50 rounded-lg transition-all group"
                                    >
                                      <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-rose-600" />
                                    </button>
                                  )}
                                </>
                              )}
                              <div className="p-2 text-zinc-300">
                                <Lock className="w-4 h-4" />
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  )}

                  {(user.role === 'owner' || user.permissions?.drivers) && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">Manage Drivers</h3>
                          {adminDrivers.some(d => d.status !== 'active') && (
                            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                              New Requests
                            </span>
                          )}
                        </div>
                        <Users className="w-5 h-5 text-zinc-400" />
                      </div>
                      <div className="divide-y divide-zinc-100">
                      {filteredDrivers.length === 0 ? (
                        <p className="p-6 text-center text-zinc-500 text-sm">No drivers found.</p>
                      ) : (
                        filteredDrivers.map(driver => (
                          <div key={driver.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center">
                                  <User className="w-5 h-5 text-zinc-400" />
                                </div>
                                <div className={`absolute -top-1 -right-1 w-3 h-3 border-2 border-white rounded-full ${
                                  driver.status === 'active' ? 'bg-emerald-500' : 
                                  driver.status === 'pending' ? 'bg-amber-500' : 
                                  driver.status === 'under verification' ? 'bg-blue-500' :
                                  'bg-rose-500'
                                }`} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-bold">{driver.name}</p>
                                  {driver.status !== 'active' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${
                                      driver.status === 'pending' ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                                      driver.status === 'under verification' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                      'bg-rose-50 text-rose-600 border-rose-100'
                                    }`}>
                                      {driver.status}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm text-zinc-500">{driver.phone}</p>
                                  <span className="text-[10px] text-zinc-400 font-medium border-l border-zinc-200 pl-2">Registered: {driver.created_at ? new Date(driver.created_at).toLocaleString('en-IN') : '---'}</span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  <span className="text-[9px] font-black bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {driver.vehicle_type || '---'}
                                  </span>
                                  <span className="text-[9px] font-black bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {driver.vehicle_number || '---'}
                                  </span>
                                  <span className="text-[9px] font-black bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    {driver.vehicle_seats || '---'} Seats
                                  </span>
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${driver.vehicle_category === 'private' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {driver.vehicle_category || 'Commercial'}
                                  </span>
                                  {(() => {
                                    const lastDeduction = driver.last_maintenance_deduction ? new Date(driver.last_maintenance_deduction) : null;
                                    const isPending = !lastDeduction || (Math.floor(Math.abs(new Date().getTime() - lastDeduction.getTime()) / (1000 * 60 * 60 * 24)) >= 30);
                                    return (
                                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${isPending ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                                        Monthly Fee: {isPending ? 'Pending' : 'Done'}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {user.role === 'owner' && (
                                  <>
                                    <button 
                                      onClick={() => setEditingDriver(driver)}
                                      className="p-2 hover:bg-zinc-100 rounded-lg transition-all"
                                    >
                                      <Settings className="w-4 h-4 text-zinc-400" />
                                    </button>
                                    {user.role === 'owner' && (
                                      <button 
                                        onClick={() => handleDeleteDriver(driver.id)}
                                        className="p-2 hover:bg-rose-50 rounded-lg transition-all group"
                                      >
                                        <Trash2 className="w-4 h-4 text-zinc-400 group-hover:text-rose-600" />
                                      </button>
                                    )}
                                  </>
                                )}
                                <div className="p-1.5 text-zinc-300">
                                  <Lock className="w-4 h-4" />
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-4">
                              <div className="text-left sm:text-right">
                                <p className="text-[10px] text-zinc-400 font-bold uppercase">Wallet</p>
                                <p className="font-bold">₹{driver.wallet_balance.toFixed(2)}</p>
                                <div className="flex gap-1 mt-1">
                                  <button onClick={() => {
                                    const amt = prompt('Enter amount to add:');
                                    if (amt !== null && amt !== '') {
                                      const parsed = parseFloat(amt);
                                      if (!isNaN(parsed)) {
                                        handleWalletAdjust(driver.id, parsed, 'credit');
                                      } else {
                                        setToast({ message: 'Invalid amount', type: 'error' });
                                      }
                                    }
                                  }} className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 font-bold">Add</button>
                                  <button onClick={() => {
                                    const amt = prompt('Enter amount to deduct:');
                                    if (amt !== null && amt !== '') {
                                      const parsed = parseFloat(amt);
                                      if (!isNaN(parsed)) {
                                        handleWalletAdjust(driver.id, parsed, 'debit');
                                      } else {
                                        setToast({ message: 'Invalid amount', type: 'error' });
                                      }
                                    }
                                  }} className="text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100 font-bold">Deduct</button>
                                  <button onClick={() => fetchDriverTransactions(driver.id, driver.name)} className="text-[10px] bg-zinc-50 text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-100 font-bold">History</button>
                                  {(() => {
                                    const lastDeduction = driver.last_maintenance_deduction ? new Date(driver.last_maintenance_deduction) : null;
                                    const isPending = !lastDeduction || (Math.floor(Math.abs(new Date().getTime() - lastDeduction.getTime()) / (1000 * 60 * 60 * 24)) >= 30);
                                    if (isPending) {
                                      return (
                                        <button 
                                          onClick={() => handleManualFeeClear(driver.id, driver.name)}
                                          className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-200 font-bold whitespace-nowrap"
                                        >
                                          Clear Fee (₹87)
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                                <select
                                  value={driver.status}
                                  onChange={(e) => setDriverStatus(driver.id, e.target.value as any)}
                                  className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-zinc-900 outline-none"
                                >
                                  <option value="under verification">Under Verification</option>
                                  <option value="documents received">Documents Received</option>
                                  <option value="documents not received">Documents Not Received</option>
                                  <option value="rejected">Rejected</option>
                                  <option value="active">Active (Approved)</option>
                                  <option value="inactive">Inactive</option>
                                </select>
                                
                                {driver.status !== 'active' && (
                                  <button
                                    onClick={() => setDriverStatus(driver.id, 'active')}
                                    className="px-4 py-2 bg-brand-primary text-white rounded-lg text-xs font-bold hover:bg-brand-primary/90 shadow-md transition-all"
                                  >
                                    Approve & Activate
                                  </button>
                                )}
                                {driver.status === 'active' && (
                                  <button
                                    onClick={() => setDriverStatus(driver.id, 'inactive')}
                                    className="px-4 py-2 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold hover:bg-rose-200 transition-all"
                                  >
                                    Deactivate
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {(user.role === 'owner' || user.permissions?.rides) && (
                    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                      <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-lg">Recent Rides</h3>
                          {user.role === 'owner' && (
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setIsRidesBulkDeleteEnabled(!isRidesBulkDeleteEnabled)}
                                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                                  isRidesBulkDeleteEnabled 
                                  ? 'bg-brand-primary text-white shadow-lg' 
                                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                }`}
                              >
                                {isRidesBulkDeleteEnabled ? 'Cancel Selection' : 'Select to Delete'}
                              </button>
                              {isRidesBulkDeleteEnabled && selectedRides.length > 0 && (
                                <button 
                                  onClick={handleBulkDeleteRides}
                                  className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-rose-700 transition-all shadow-lg flex items-center gap-1.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete ({selectedRides.length})
                                </button>
                              )}
                              {isRidesBulkDeleteEnabled && (
                                <button 
                                  onClick={() => {
                                    const completedIds = filteredRides.filter(r => r.status === 'completed').map(r => r.id);
                                    setSelectedRides(completedIds);
                                  }}
                                  className="px-3 py-1.5 bg-zinc-100 text-zinc-600 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-zinc-200 transition-all"
                                >
                                  Select All Completed
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        {(user.role === 'owner' || user.permissions?.rides) && (
                          <button 
                            onClick={() => setIsManualRideModalOpen(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl text-xs font-bold hover:bg-brand-primary/90 transition-all shadow-lg"
                          >
                            <Plus className="w-4 h-4" />
                            Manual Add Ride
                          </button>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-zinc-50 text-xs font-bold uppercase text-zinc-400">
                          <tr>
                            {isRidesBulkDeleteEnabled && <th className="px-6 py-4"></th>}
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Driver</th>
                            <th className="px-6 py-4">Route & Schedule</th>
                            <th className="px-6 py-4">KM</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Fare</th>
                            <th className="px-6 py-4">Feedback</th>
                            {user.role === 'owner' && <th className="px-6 py-4 text-right">Actions</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {filteredRides.map(ride => (
                            <tr key={ride.id} className={`text-sm transition-colors ${selectedRides.includes(ride.id) ? 'bg-rose-50/50' : ''}`}>
                              {isRidesBulkDeleteEnabled && (
                                <td className="px-6 py-4">
                                  {ride.status === 'completed' ? (
                                    <input 
                                      type="checkbox"
                                      className="w-4 h-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                                      checked={selectedRides.includes(ride.id)}
                                      onChange={() => {
                                        if (selectedRides.includes(ride.id)) {
                                          setSelectedRides(selectedRides.filter(id => id !== ride.id));
                                        } else {
                                          setSelectedRides([...selectedRides, ride.id]);
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="w-4 h-4" />
                                  )}
                                </td>
                              )}
                              <td className="px-6 py-4 font-mono text-xs">{ride.tracking_id}</td>
                              <td className="px-6 py-4 font-medium">
                                <div>{(ride as any).user_name || 'Guest'}</div>
                                <div className="text-[10px] text-zinc-500 font-bold">{(ride as any).user_phone || '---'}</div>
                              </td>
                              <td className="px-6 py-4 font-medium">{(ride as any).driver_name || '---'}</td>
                              <td className="px-6 py-4">
                                <p className="truncate max-w-[150px] font-bold">{ride.pickup_location} → {ride.dropoff_location}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {ride.trip_type === 'round' ? (
                                    <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1 py-0.5 rounded font-bold uppercase">Round</span>
                                  ) : (
                                    <span className="text-[8px] bg-zinc-50 text-zinc-600 px-1 py-0.5 rounded font-bold uppercase">Single</span>
                                  )}
                                  {ride.pickup_date && (
                                    <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                      <Clock className="w-2 h-2" /> {ride.pickup_date} {ride.pickup_time}
                                    </span>
                                  )}
                                  <span className="text-[8px] bg-zinc-100 text-zinc-500 px-1 py-0.5 rounded font-bold uppercase">
                                    Req: {new Date(ride.created_at).toLocaleDateString()}
                                  </span>
                                  {ride.vehicle_type && (
                                    <span className="text-[8px] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded font-bold uppercase">
                                      {ride.vehicle_type}
                                    </span>
                                  )}
                                  {ride.passengers && (
                                    <span className="text-[8px] bg-zinc-100 text-zinc-600 px-1 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                      <Users className="w-2 h-2" /> {ride.passengers}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 font-medium">{(ride as any).distance || '---'}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-2">
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${getStatusColor(ride.status)}`}>
                                    {getStatusLabel(ride.status, ride.advance_paid)}
                                  </span>
                                  {(user.role === 'owner' || user.permissions?.rides) && (
                                    <select
                                      value={ride.status}
                                      onChange={async (e) => {
                                        const newStatus = e.target.value;
                                        if (confirm(`Change ride status to ${newStatus}?`)) {
                                          try {
                                            await updateDoc(doc(db, 'rides', ride.id), { status: newStatus });
                                            setToast({ message: 'Ride status updated', type: 'success' });
                                          } catch (err) {
                                            setToast({ message: 'Failed to update status', type: 'error' });
                                          }
                                        }
                                      }}
                                      className="text-[9px] font-bold bg-zinc-50 border border-zinc-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-zinc-900"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="accepted">Accepted</option>
                                      <option value="arrived">Arrived</option>
                                      <option value="started">Started</option>
                                      <option value="completed">Completed</option>
                                      <option value="cancelled">Cancelled</option>
                                    </select>
                                  )}
                                </div>
                                {ride.status === 'cancelled' && ride.cancellation_reason && (
                                  <div className="text-[8px] font-bold text-rose-600 uppercase mt-1">
                                    Reason: {ride.cancellation_reason}
                                  </div>
                                )}
                                {ride.advance_paid && (
                                  <div className="text-[8px] font-black text-emerald-600 uppercase mt-1">
                                    ₹{ride.advance_paid} Adv. Paid
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 font-sans">
                                {ride.extra_charge && ride.extra_charge > 0 ? (
                                  <div className="flex flex-col gap-0.5 text-right md:text-left">
                                    <span className="text-xs text-zinc-400">Base: ₹{ride.fare}</span>
                                    <span className="text-xs text-amber-600 font-bold">Extra: +₹{ride.extra_charge}</span>
                                    <span className="font-black text-sm text-neutral-800">Total: ₹{ride.final_total_fare}</span>
                                  </div>
                                ) : (
                                  <div className="font-bold">₹{ride.fare}</div>
                                )}
                                {ride.discount > 0 && <div className="text-[10px] text-emerald-600">(-₹{ride.discount})</div>}
                              </td>
                              <td className="px-6 py-4">
                                {ride.rating && (
                                  <div className="flex flex-col gap-1 mb-1">
                                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
                                      <Star className="w-3 h-3 fill-current" /> {ride.rating}/5
                                    </div>
                                    {ride.review && <p className="text-[9px] text-zinc-500 italic max-w-[120px] truncate" title={ride.review}>"{ride.review}"</p>}
                                  </div>
                                )}
                                {ride.complaint && (user.role === 'owner' || ride.complaint_forwarded_to_admin_id === user.id) && (
                                  <div className="p-1.5 bg-rose-50 border border-rose-100 rounded-lg">
                                    <p className="text-[9px] font-bold text-rose-600 uppercase flex items-center gap-1">
                                      <AlertCircle className="w-2.5 h-2.5" /> Complaint
                                    </p>
                                    <p className="text-[9px] text-rose-700 italic mb-1 whitespace-pre-wrap" title={ride.complaint}>"{ride.complaint}"</p>
                                    <div className="flex gap-3 mb-1 pb-1 border-b border-rose-100">
                                      <div>
                                        <p className="text-[7px] font-bold text-zinc-400 uppercase">User Phone</p>
                                        <p className="text-[8px] font-bold">{ride.complaint_user_phone || ride.user_phone || '---'}</p>
                                      </div>
                                      <div>
                                        <p className="text-[7px] font-bold text-zinc-400 uppercase">Driver Phone</p>
                                        <p className="text-[8px] font-bold">{ride.complaint_driver_phone || ride.driver_phone || '---'}</p>
                                      </div>
                                    </div>
                                    {ride.complaint_user_reply && (
                                      <div className="mt-1 pt-1 border-t border-rose-100">
                                        <p className="text-[8px] font-bold text-emerald-600 uppercase">User Reply:</p>
                                        <p className="text-[9px] text-emerald-700 italic">{ride.complaint_user_reply}</p>
                                      </div>
                                    )}
                                    {ride.complaint_driver_reply && (
                                      <div className="mt-1 pt-1 border-t border-rose-100">
                                        <p className="text-[8px] font-bold text-indigo-600 uppercase">Admin to Driver:</p>
                                        <p className="text-[9px] text-indigo-700 italic">{ride.complaint_driver_reply}</p>
                                      </div>
                                    )}
                                    {ride.complaint_driver_response && (
                                      <div className="mt-1 pt-1 border-t border-rose-100">
                                        <p className="text-[8px] font-bold text-emerald-600 uppercase">Driver Response:</p>
                                        <p className="text-[9px] text-emerald-700 italic">{ride.complaint_driver_response}</p>
                                      </div>
                                    )}
                                    {ride.complaint_reply && !ride.complaint_user_reply && (
                                      <div className="mt-1 pt-1 border-t border-rose-100">
                                        <p className="text-[8px] font-bold text-emerald-600 uppercase">Reply:</p>
                                        <p className="text-[9px] text-emerald-700 italic">{ride.complaint_reply}</p>
                                      </div>
                                    )}
                                    <div className="flex justify-between items-center mt-1">
                                      <span className={`text-[7px] font-bold uppercase ${ride.complaint_status === 'resolved' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {ride.complaint_status || 'pending'}
                                      </span>
                                      <div className="flex gap-1">
                                        {user.role === 'owner' && (
                                          <button 
                                            onClick={() => setComplaintReplyModal({ 
                                              rideId: ride.id, 
                                              complaint: ride.complaint, 
                                              driverId: ride.driver_id,
                                              userPhone: ride.complaint_user_phone || ride.user_phone,
                                              driverPhone: ride.complaint_driver_phone || ride.driver_phone
                                            })}
                                            className="text-[7px] bg-white border border-indigo-200 px-1 py-0.5 rounded text-indigo-600 font-bold hover:bg-indigo-50"
                                          >
                                            Reply / Forward
                                          </button>
                                        )}
                                        {ride.complaint_status !== 'resolved' && (user.role === 'owner' || ride.complaint_forwarded_to_admin_id === user.id) && (
                                          <button 
                                            onClick={() => setComplaintReplyModal({ 
                                              rideId: ride.id, 
                                              complaint: ride.complaint, 
                                              driverId: ride.driver_id,
                                              userPhone: ride.complaint_user_phone || ride.user_phone,
                                              driverPhone: ride.complaint_driver_phone || ride.driver_phone
                                            })}
                                            className="text-[7px] bg-white border border-rose-200 px-1 py-0.5 rounded text-rose-600 font-bold hover:bg-rose-50"
                                          >
                                            Resolve with Message
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {!ride.rating && !ride.complaint && <span className="text-zinc-300 text-[10px]">---</span>}
                              </td>
                              {user.role === 'owner' && (
                                <td className="px-6 py-4 text-right">
                                  <button 
                                    onClick={() => handleDeleteRide(ride.id)}
                                    className="p-2 hover:bg-rose-50 rounded-lg transition-all group"
                                    title="Delete Ride Record"
                                  >
                                    <X className="w-4 h-4 text-zinc-300 group-hover:text-rose-600" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}

                  {selectedDriverTransactions && (
                    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                      >
                        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                          <div>
                            <h3 className="font-bold text-xl">{selectedDriverTransactions.name}'s Transactions</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs opacity-60">Full history of wallet movements</p>
                              {(user.role === 'owner' || user.role === 'admin') && (
                                <div className="flex items-center gap-2 ml-4">
                                  <button 
                                    onClick={() => setIsTransactionsBulkDeleteEnabled(!isTransactionsBulkDeleteEnabled)}
                                    className={`px-2 py-1 rounded-lg text-[8px] font-bold uppercase tracking-wider transition-all ${
                                      isTransactionsBulkDeleteEnabled 
                                      ? 'bg-white text-zinc-900' 
                                      : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                                  >
                                    {isTransactionsBulkDeleteEnabled ? 'Cancel Selection' : 'Select to Delete'}
                                  </button>
                                  {isTransactionsBulkDeleteEnabled && selectedTransactions.length > 0 && (
                                    <button 
                                      onClick={handleBulkDeleteTransactions}
                                      className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[8px] font-bold uppercase tracking-wider hover:bg-rose-700 transition-all"
                                    >
                                      Delete ({selectedTransactions.length})
                                    </button>
                                  )}
                                  {isTransactionsBulkDeleteEnabled && (
                                    <button 
                                      onClick={() => {
                                        const allIds = selectedDriverTransactions.transactions.map((t: any) => t.id);
                                        setSelectedTransactions(allIds);
                                      }}
                                      className="px-2 py-1 bg-white/10 text-white rounded-lg text-[8px] font-bold uppercase tracking-wider hover:bg-white/20 transition-all"
                                    >
                                      Select All
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <button onClick={() => {
                            setSelectedDriverTransactions(null);
                            setIsTransactionsBulkDeleteEnabled(false);
                            setSelectedTransactions([]);
                          }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6">
                          <div className="space-y-3">
                            {selectedDriverTransactions.transactions.length === 0 ? (
                              <p className="text-center text-zinc-500 py-8">No transactions found.</p>
                            ) : (
                              selectedDriverTransactions.transactions.map((t: any) => (
                                <div key={t.id} className={`p-4 rounded-2xl border transition-all flex justify-between items-center ${
                                  selectedTransactions.includes(t.id) 
                                  ? 'bg-rose-50 border-rose-200' 
                                  : 'bg-zinc-50 border-zinc-100'
                                }`}>
                                  <div className="flex items-center gap-3">
                                    {isTransactionsBulkDeleteEnabled && (
                                      <input 
                                        type="checkbox"
                                        className="w-4 h-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                                        checked={selectedTransactions.includes(t.id)}
                                        onChange={() => {
                                          if (selectedTransactions.includes(t.id)) {
                                            setSelectedTransactions(selectedTransactions.filter(id => id !== t.id));
                                          } else {
                                            setSelectedTransactions([...selectedTransactions, t.id]);
                                          }
                                        }}
                                      />
                                    )}
                                    <div>
                                      <p className="font-bold text-sm">{t.description}</p>
                                      <p className="text-[10px] text-zinc-400">{new Date(t.created_at).toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <p className={`font-black ${t.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {t.type === 'credit' ? '+' : '-'}₹{t.amount.toFixed(2)}
                                  </p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                  {complaintReplyModal && (
                    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                      >
                        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-rose-600 text-white shrink-0">
                          <h3 className="font-bold text-xl">Reply to Complaint</h3>
                          <button onClick={() => setComplaintReplyModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                          <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-xs font-bold text-rose-600 uppercase mb-1">User Complaint:</p>
                                <p className="text-sm text-rose-700 italic">"{complaintReplyModal.complaint}"</p>
                              </div>
                            </div>
                            <div className="flex gap-4 pt-2 border-t border-rose-200 mt-2">
                              <div>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase">User Phone</p>
                                <p className="text-xs font-bold">{complaintReplyModal.userPhone || '---'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-zinc-500 uppercase">Driver Phone</p>
                                <p className="text-xs font-bold">{complaintReplyModal.driverPhone || '---'}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Resolution Message for User</label>
                              <textarea
                                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm min-h-[80px] focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none transition-all"
                                placeholder="Explain what was resolved for the user..."
                                value={complaintUserReply}
                                onChange={e => setComplaintUserReply(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Message for Driver (Optional)</label>
                              <textarea
                                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm min-h-[80px] focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                placeholder="Instructions or feedback for the driver..."
                                value={complaintDriverReply}
                                onChange={e => setComplaintDriverReply(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-3 pt-2">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Forward Options</p>
                            
                            <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
                              <input 
                                type="checkbox" 
                                checked={forwardToDriver}
                                onChange={(e) => setForwardToDriver(e.target.checked)}
                                className="w-5 h-5 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-bold text-zinc-900">Forward to Driver</p>
                                <p className="text-[10px] text-zinc-500">The driver will see the complaint and your "Reply to Driver".</p>
                              </div>
                            </label>

                            <div className="space-y-1">
                              <p className="text-xs font-medium text-zinc-600">Forward to Admin</p>
                              <select
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm"
                                value={forwardToAdminId}
                                onChange={e => setForwardToAdminId(e.target.value)}
                              >
                                <option value="">Select Admin (Optional)</option>
                                {otherAdmins.map(admin => (
                                  <option key={admin.id} value={admin.id}>{admin.username} ({admin.role})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              onClick={() => handleSendComplaintReply(false)}
                              disabled={isActionLoading || (!forwardToDriver && !forwardToAdminId)}
                              className="w-full bg-zinc-100 text-zinc-900 py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {isActionLoading ? (
                                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                              ) : (
                                <>Forward Only</>
                              )}
                            </button>
                            <button 
                              onClick={() => handleSendComplaintReply(true)}
                              disabled={isActionLoading || !complaintUserReply.trim()}
                              className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                            >
                              {isActionLoading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              ) : (
                                <>Resolve & Send Replies</>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}

                  {editingAdmin && (
                    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                      >
                        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                          <h3 className="font-bold text-xl">Edit Admin</h3>
                          <button onClick={() => setEditingAdmin(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        <form onSubmit={handleUpdateAdmin} className="p-6 space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Username</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingAdmin.username}
                              onChange={e => setEditingAdmin({ ...editingAdmin, username: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingAdmin.password}
                              onChange={e => setEditingAdmin({ ...editingAdmin, password: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">PIN</label>
                            <input
                              type="text"
                              maxLength={4}
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingAdmin.pin}
                              onChange={e => setEditingAdmin({ ...editingAdmin, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                            />
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Permissions</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(editingAdmin.permissions || {}).map(([key, value]) => (
                                <label key={key} className="flex items-center gap-2 cursor-pointer group">
                                  <input 
                                    type="checkbox" 
                                    checked={value as boolean}
                                    onChange={(e) => setEditingAdmin({
                                      ...editingAdmin,
                                      permissions: { ...editingAdmin.permissions, [key]: e.target.checked }
                                    })}
                                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                                  />
                                  <span className="text-xs font-medium text-zinc-600 group-hover:text-zinc-900 capitalize">{key}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <button className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg">
                            Update Admin
                          </button>
                        </form>
                      </motion.div>
                    </div>
                  )}

                  {editingUser && (
                    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                      >
                        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                          <h3 className="font-bold text-xl">Edit User</h3>
                          <button onClick={() => setEditingUser(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingUser.name}
                              onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Phone (Login ID)</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingUser.phone}
                              onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingUser.password}
                              onChange={e => setEditingUser({ ...editingUser, password: e.target.value })}
                            />
                          </div>
                          <button className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg">
                            Update User
                          </button>
                        </form>
                      </motion.div>
                    </div>
                  )}

                  {editingDriver && (
                    <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
                      >
                        <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                          <h3 className="font-bold text-xl">Edit Driver</h3>
                          <button onClick={() => setEditingDriver(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                        <form onSubmit={handleUpdateDriver} className="p-6 space-y-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Name</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingDriver.name}
                              onChange={e => setEditingDriver({ ...editingDriver, name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Phone (Login ID)</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingDriver.phone}
                              onChange={e => setEditingDriver({ ...editingDriver, phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Password</label>
                            <input
                              type="text"
                              className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                              value={editingDriver.password}
                              onChange={e => setEditingDriver({ ...editingDriver, password: e.target.value })}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Vehicle Number</label>
                              <input
                                type="text"
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                                value={editingDriver.vehicle_number || ''}
                                onChange={e => setEditingDriver({ ...editingDriver, vehicle_number: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Category</label>
                              <select
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                                value={editingDriver.vehicle_category || 'commercial'}
                                onChange={e => setEditingDriver({ ...editingDriver, vehicle_category: e.target.value })}
                              >
                                <option value="commercial">Commercial</option>
                                <option value="private">Private</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Vehicle Type</label>
                              <select
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                                value={editingDriver.vehicle_type || 'Sedan (AC)'}
                                onChange={e => {
                                  const type = e.target.value;
                                  const seats = (VEHICLE_RATES as any)[type]?.seats || 4;
                                  setEditingDriver({ ...editingDriver, vehicle_type: type, vehicle_seats: seats.toString() });
                                }}
                              >
                                {Object.keys(VEHICLE_RATES).map(type => (
                                  <option key={type} value={type}>{type}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Seats</label>
                              <select
                                className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                                value={editingDriver.vehicle_seats || '4'}
                                onChange={e => setEditingDriver({ ...editingDriver, vehicle_seats: e.target.value })}
                              >
                                {[1, 3, 4, 6, 7, 9, 10, 12, 16].map(num => (
                                  <option key={num} value={num.toString()}>{num} Seater</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <button className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg">
                            Update Driver
                          </button>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </div>
                    ) : (
                      <div className="text-center py-20 space-y-4">
                        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto">
                          <ShieldCheck className="w-10 h-10 text-rose-600" />
                        </div>
                        <h2 className="text-2xl font-bold">Unauthorized Access</h2>
                        <p className="text-zinc-500">You do not have permission to view the Admin Dashboard.</p>
                        <button onClick={() => setView('user')} className="bg-brand-primary text-white px-6 py-2 rounded-xl font-bold shadow-lg">Return to Home</button>
                      </div>
                    )
                  )}
                </motion.div>
              )}

          {/* DRIVER VIEW */}
          {view === 'driver' && (
            <motion.div
              key="driver"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {!user ? (
                <motion.div 
                  initial={{ rotateY: 20, opacity: 0 }}
                  animate={{ rotateY: 0, opacity: 1 }}
                  className="max-w-md mx-auto glass p-10 rounded-[2.5rem] relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-rose-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                  <h2 className="text-2xl sm:text-3xl font-black mb-8 flex items-center gap-3">
                    <div className="p-2 bg-brand-primary rounded-xl shadow-lg shrink-0">
                      <Car className="text-white w-6 h-6" /> 
                    </div>
                    <span className="gradient-text truncate">
                      {driverAuthMode === 'login' ? 'Driver Login' : 'Driver Registration'}
                    </span>
                  </h2>
                  {error && (
                    <div className="mb-4 p-3 bg-rose-50 text-rose-600 text-sm rounded-xl border border-rose-100">
                      {error}
                      <button onClick={() => setError('')} className="float-right"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                  
                  <form onSubmit={driverAuthMode === 'login' ? handleDriverLogin : handleDriverRegister} className="space-y-4">
                    {driverAuthMode === 'register' && (
                      <div className="space-y-4">
                        <input
                          type="text"
                          placeholder="Full Name"
                          required
                          className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          value={loginData.name}
                          onChange={e => setLoginData({ ...loginData, name: e.target.value })}
                        />
                        <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Date of Birth</label>
                          <input
                            type="date"
                            required
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            value={loginData.dob}
                            onChange={e => setLoginData({ ...loginData, dob: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <input
                            type="text"
                            placeholder="Vehicle Number"
                            required
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            value={loginData.vehicle_number}
                            onChange={e => setLoginData({ ...loginData, vehicle_number: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <select
                            required
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            value={loginData.vehicle_category}
                            onChange={e => setLoginData({ ...loginData, vehicle_category: e.target.value })}
                          >
                            <option value="commercial">Commercial</option>
                            <option value="private">Private</option>
                          </select>
                          <select
                            required
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            value={loginData.vehicle_type}
                            onChange={e => {
                              const type = e.target.value;
                              const seats = (VEHICLE_RATES as any)[type]?.seats || 4;
                              setLoginData({ ...loginData, vehicle_type: type, vehicle_seats: seats.toString() });
                            }}
                          >
                            {Object.keys(VEHICLE_RATES).map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <select
                            required
                            className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900"
                            value={loginData.vehicle_seats}
                            onChange={e => setLoginData({ ...loginData, vehicle_seats: e.target.value })}
                          >
                            {[1, 3, 4, 6, 7, 9, 10, 12, 16].map(num => (
                              <option key={num} value={num.toString()}>{num} Seater</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                    
                    <input
                      type="tel"
                      placeholder="Phone Number (e.g. 9876543210)"
                      required
                      className="w-full px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      value={loginData.phone}
                      onChange={e => setLoginData({ ...loginData, phone: e.target.value })}
                    />
                    <input
                      type="password"
                      placeholder="Password"
                      required
                      className="w-full px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      value={loginData.password}
                      onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                    />
                    {driverAuthMode === 'login' && (
                      <div className="flex justify-end">
                        <button 
                          type="button"
                          onClick={() => {
                            setForgotPasswordType('driver');
                            setIsForgotPasswordModalOpen(true);
                          }}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
                        >
                          Forgot Password?
                        </button>
                      </div>
                    )}
                    
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      disabled={isVerifying}
                      className="w-full bg-brand-primary text-white py-4 rounded-xl font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
                    >
                      {isVerifying ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        driverAuthMode === 'login' ? 'Login' : 'Register'
                      )}
                    </motion.button>
                  </form>

                  <div className="mt-6 text-center space-y-2">
                    <button 
                      onClick={() => {
                        setDriverAuthMode(driverAuthMode === 'login' ? 'register' : 'login');
                        setError('');
                      }}
                      className="block w-full text-sm font-medium text-zinc-500 hover:text-zinc-900"
                    >
                      {driverAuthMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
                    </button>
                    <div className="pt-4 border-t border-zinc-100">
                      <button 
                        onClick={() => setView('user')}
                        className="text-xs font-bold text-zinc-400 hover:text-zinc-900 uppercase tracking-wider"
                      >
                        Back to User Login
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                    user?.role === 'driver' ? (
                      user.status !== 'active' ? (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="max-w-md mx-auto bg-white p-10 rounded-[2.5rem] border border-zinc-200 text-center space-y-6 shadow-xl"
                        >
                          <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                            {user.status === 'rejected' ? (
                              <X className="w-12 h-12 text-rose-600" />
                            ) : (
                              <Clock className="w-12 h-12 text-amber-600 animate-pulse" />
                            )}
                          </div>
                          <div className="space-y-2">
                            <h2 className="text-2xl font-black">
                              {user.status === 'rejected' ? 'Profile Rejected' : 
                               user.status === 'documents not received' ? 'Documents Required' :
                               'Verification Pending'}
                            </h2>
                            <p className="text-zinc-500 text-sm leading-relaxed">
                              {user.status === 'under verification' ? (
                                <>
                                  Profile under verification. Please send your vehicle and personal documents on WhatsApp: <span className="font-bold text-zinc-900">9906361392</span> for verification.
                                </>
                              ) : user.status === 'documents received' ? (
                                "Documents received! Our team is currently reviewing them. We will notify you once your account is activated."
                              ) : user.status === 'documents not received' ? (
                                <>
                                  We haven't received your documents yet. Please send them on WhatsApp: <span className="font-bold text-zinc-900">9906361392</span> to proceed.
                                </>
                              ) : user.status === 'rejected' ? (
                                "Your profile has been rejected. Please contact support for more information."
                              ) : (
                                "Your profile is currently under review by our team. We will notify you once your account is activated."
                              )}
                            </p>
                          </div>
                          <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Current Status</p>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              user.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                              user.status === 'documents received' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {user.status || 'Pending'}
                            </span>
                          </div>
                          
                          {user.status === 'documents not received' && (
                            <motion.div 
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-700 text-sm font-bold flex items-center gap-3"
                            >
                              <AlertCircle className="w-5 h-5 flex-shrink-0" />
                              <p>Action Required: Send documents to 9906361392</p>
                            </motion.div>
                          )}

                          <button 
                            onClick={handleLogout}
                            className="w-full py-3 text-zinc-500 font-bold hover:text-zinc-900 transition-colors"
                          >
                            Logout
                          </button>
                        </motion.div>
                      ) : (
                  <div className="space-y-6">
                    <div className="text-center space-y-2 mb-6">
                      <h1 className="text-2xl sm:text-3xl font-black tracking-tighter">
                        Welcome, <span className="gradient-text">{user.name || user.username || 'Driver'}!</span>
                      </h1>
                      <p className="text-zinc-500 text-sm font-medium">Ready to hit the road?</p>
                    </div>
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-zinc-900 text-white p-4 rounded-3xl shadow-2xl relative overflow-hidden group border border-white/10 max-w-sm mx-auto"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-brand-primary/20 to-transparent rounded-full -mr-16 -mt-16 blur-2xl group-hover:scale-110 transition-transform" />
                      
                      <div className="relative z-10 flex items-center justify-between gap-4">
                        <div className="shrink-0">
                          <p className="text-zinc-400 font-black uppercase tracking-widest text-[7px] mb-0.5">Available Amount</p>
                          <h2 className="text-lg font-black">₹{driverWallet.balance.toFixed(2)}</h2>
                        </div>
                        
                        <div className="flex gap-1.5">
                          <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsRechargeModalOpen(true)}
                            className="bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-black hover:bg-emerald-600 transition-all flex items-center gap-1 shadow-md text-[9px] uppercase tracking-wider"
                          >
                            <PlusCircle className="w-2.5 h-2.5" /> Recharge
                          </motion.button>
                        </div>
                      </div>
                      
                      {(user.free_rides || 0) > 0 && (
                        <div className="mt-2 flex items-center gap-1 bg-emerald-500/20 w-fit px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <Zap className="w-2 h-2 text-emerald-400" />
                          <span className="text-[7px] font-black uppercase tracking-widest">
                            {user.free_rides} Free Rides Left 
                          </span>
                        </div>
                      )}
                    </motion.div>

                  {/* Recent Completed Rides removed as it is now in the All Rides tabbed section */}

                  {driverWithdrawals.length > 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5 text-zinc-400" /> Withdrawal History
                      </h3>
                      <div className="divide-y divide-zinc-100">
                        {driverWithdrawals.map(req => (
                          <div key={req.id} className="py-3 flex justify-between items-center">
                            <div>
                              <p className="font-bold">₹{req.amount.toFixed(2)}</p>
                              <p className="text-[10px] text-zinc-400">{new Date(req.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                              req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 
                              req.status === 'pending' ? 'bg-amber-100 text-amber-700' : 
                              'bg-rose-100 text-rose-700'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <h3 className="font-bold text-2xl flex items-center gap-2">
                        <Clock className="w-6 h-6 text-zinc-900" /> All Rides
                      </h3>
                      
                      <div className="flex p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                        <button
                          onClick={() => setDriverRidesTab('all')}
                          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
                            driverRidesTab === 'all' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
                          }`}
                        >
                          All Rides
                        </button>
                      </div>
                    </div>

                    {availableRides.filter(ride => {
                      if (driverRidesTab === 'all') return true;
                      if (driverRidesTab === 'available') return ride.status === 'pending';
                      if (driverRidesTab === 'accepted') return ride.status === 'accepted' || ride.status === 'ongoing';
                      if (driverRidesTab === 'completed') return ride.status === 'completed' || ride.status === 'cancelled';
                      return false;
                    })
                    .length === 0 ? (
                      <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center space-y-2">
                        <p className="text-zinc-500">No {driverRidesTab === 'completed' ? 'history' : driverRidesTab === 'all' ? 'rides' : driverRidesTab} rides right now.</p>
                        <p className="text-sm text-zinc-400">New ride requests will appear here in real-time.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {availableRides
                          .filter(ride => {
                            if (driverRidesTab === 'all') return true;
                            if (driverRidesTab === 'available') return ride.status === 'pending';
                            if (driverRidesTab === 'accepted') return ride.status === 'accepted' || ride.status === 'ongoing';
                            if (driverRidesTab === 'completed') return ride.status === 'completed' || ride.status === 'cancelled';
                            return false;
                          })
                          .sort((a, b) => {
                            if (a.status === 'pending' && b.status !== 'pending') return -1;
                            if (a.status !== 'pending' && b.status === 'pending') return 1;
                            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                          })
                          .map(ride => (
                          <div key={ride.id} className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
                            <div className="flex justify-between items-center">
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pickup Date/Time</p>
                                <p className="text-xs font-bold text-emerald-600">{ride.pickup_date} {ride.pickup_time}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Requested At</p>
                                <p className="text-xs font-medium text-zinc-600">{new Date(ride.created_at).toLocaleString()}</p>
                              </div>
                              <div className="text-right font-sans">
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Fare</p>
                                {ride.extra_charge && ride.extra_charge > 0 ? (
                                  <div className="flex flex-col items-end gap-0.5 mt-1">
                                    <span className="text-[10px] text-zinc-400">Base: ₹{ride.fare}</span>
                                    <span className="text-[10px] text-amber-600 font-bold">Extra: +₹{ride.extra_charge}</span>
                                    <p className="text-sm font-black text-emerald-600">Total: ₹{ride.final_total_fare}</p>
                                  </div>
                                ) : (
                                  <p className="text-xl font-bold text-emerald-600">₹{ride.fare}</p>
                                )}
                                {ride.vehicle_type && (
                                  <div className="flex flex-col items-end gap-1 mt-1">
                                    <p className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">
                                      {ride.vehicle_type}
                                    </p>
                                    {ride.passengers && (
                                      <p className="text-[10px] font-bold text-zinc-500 flex items-center gap-1">
                                        <Users className="w-2.5 h-2.5" /> {ride.passengers} Pax
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <div className="flex gap-3">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                  <div className="w-0.5 h-4 bg-zinc-100" />
                                  <div className="w-2 h-2 rounded-full bg-brand-primary" />
                                </div>
                                <div className="flex-1 space-y-3">
                                  <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Pickup</p>
                                    <p className="text-sm font-bold">{ride.pickup_location}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase">Dropoff</p>
                                    <p className="text-sm font-bold">{ride.dropoff_location}</p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-zinc-50">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${getStatusColor(ride.status)}`}>
                                  {ride.status === 'pending' && <Clock className="w-2.5 h-2.5" />}
                                  {(ride.status === 'accepted' || ride.status === 'ongoing') && <Navigation className="w-2.5 h-2.5" />}
                                  {ride.status === 'cancelled' && <XCircle className="w-2.5 h-2.5" />}
                                  {ride.status === 'completed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                                  {ride.status === 'pending' ? 'New Request' : getStatusLabel(ride.status)}
                                  {ride.driver_id && ride.driver_id !== user.id && ride.driver_name && ` (by ${ride.driver_name})`}
                                </span>
                                {ride.status === 'cancelled' && ride.cancellation_reason && (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-700">
                                    Reason: {ride.cancellation_reason}
                                  </span>
                                )}
                                {ride.trip_type === 'round' ? (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">Round Trip</span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-zinc-100 text-zinc-700">Single Trip</span>
                                )}
                              </div>
                              {ride.distance && (
                                <p className="text-[10px] font-bold text-zinc-400 uppercase">{ride.distance} KM</p>
                              )}
                            </div>

                            {/* Driver Navigator & Routing Map */}
                            {ride.driver_id === user.id && (ride.status === 'accepted' || ride.status === 'ongoing') && (
                              <div className="space-y-3 my-2">
                                {/* Embedded map */}
                                {(ride.pickup_coords || ride.dropoff_coords) ? (
                                  <div className="w-full border border-zinc-200/80 rounded-2xl overflow-hidden shadow-inner relative z-0">
                                    <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-100 flex items-center justify-between text-[10px] font-black text-zinc-500 uppercase tracking-wider font-sans">
                                      <span className="flex items-center gap-1">🧭 NAVIGATOR ROUTE MAP</span>
                                      {ride.distance && <span className="text-zinc-800 font-extrabold">{ride.distance} KM</span>}
                                    </div>
                                    <MapComponent pickup={ride.pickup_coords} dropoff={ride.dropoff_coords} />
                                  </div>
                                ) : (
                                  <div className="p-3 bg-zinc-50 rounded-xl text-center border border-zinc-100">
                                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-sans">Coordinates loading fallback via launcher buttons below</p>
                                  </div>
                                )}

                                {/* Google Maps Navigation Launcher buttons */}
                                <div className="grid grid-cols-2 gap-2">
                                  <a 
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ride.pickup_location)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs font-bold rounded-xl transition-all"
                                  >
                                    <span>📍 Route to Pickup</span>
                                  </a>
                                  <a 
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(ride.pickup_location)}&destination=${encodeURIComponent(ride.dropoff_location)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-all"
                                  >
                                    <span>🏁 Route to Dropoff</span>
                                  </a>
                                </div>
                              </div>
                            )}

                            {/* Passenger Contact - Only visible after acceptance by THIS driver */}
                            {ride.driver_id === user.id && (ride.status === 'accepted' || ride.status === 'ongoing') && (
                              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-emerald-600" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-emerald-700 uppercase">Passenger</p>
                                    <p className="text-sm font-bold text-emerald-900">{ride.user_name || 'Guest'}</p>
                                  </div>
                                </div>
                                <a 
                                  href={`tel:${ride.user_phone}`}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                                >
                                  Call: {ride.user_phone}
                                </a>
                              </div>
                            )}

                            {ride.status === 'completed' && (
                              <div className="space-y-3">
                                {ride.complaint && ride.complaint_forwarded_to_driver && (
                                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl space-y-2">
                                    <div className="flex items-center justify-between text-rose-600">
                                      <div className="flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4" />
                                        <p className="text-xs font-bold uppercase">Complaint Received</p>
                                      </div>
                                      <span className={`text-[8px] font-bold uppercase ${ride.complaint_status === 'resolved' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {ride.complaint_status || 'pending'}
                                      </span>
                                    </div>
                                    <p className="text-sm text-rose-700 italic">"{ride.complaint}"</p>
                                    {!ride.complaint_driver_response && (
                                      <div className="pt-2 border-t border-rose-100 space-y-2">
                                        <textarea
                                          placeholder="Write your response to this complaint..."
                                          className="w-full p-2 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-rose-500 outline-none"
                                          rows={2}
                                          id={`driver-response-${ride.id}`}
                                        />
                                        <button
                                          onClick={async () => {
                                            const responseInput = document.getElementById(`driver-response-${ride.id}`) as HTMLTextAreaElement;
                                            const response = responseInput?.value;
                                            if (!response?.trim()) {
                                              setToast({ message: "Please enter a response", type: 'error' });
                                              return;
                                            }
                                            setIsActionLoading(true);
                                            try {
                                              await updateDoc(doc(db, 'rides', ride.id), {
                                                complaint_driver_response: response,
                                                complaint_status: 'resolved'
                                              });
                                              setToast({ message: "Response sent successfully", type: 'success' });
                                            } catch (err: any) {
                                              handleFirestoreError(err, OperationType.UPDATE, `rides/${ride.id}`);
                                            } finally {
                                              setIsActionLoading(false);
                                            }
                                          }}
                                          disabled={isActionLoading}
                                          className="w-full bg-rose-600 text-white py-1.5 rounded-lg text-[10px] font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                                        >
                                          {isActionLoading ? 'Sending...' : 'Send Response'}
                                        </button>
                                      </div>
                                    )}
                                    {ride.complaint_driver_response && (
                                      <div className="pt-2 border-t border-rose-100">
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase">Your Response:</p>
                                        <p className="text-xs text-emerald-700 italic">{ride.complaint_driver_response}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {ride.rating && (
                                  <div className="px-4 py-2 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-2">
                                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                                    <span className="text-[10px] font-bold text-amber-700">User Rated: {ride.rating} Stars</span>
                                    {ride.review && <span className="text-[10px] text-amber-600 italic">"{ride.review}"</span>}
                                  </div>
                                )}
                              </div>
                            )}

                            {ride.status === 'pending' && (
                              <div className="space-y-3">
                                {acceptingRideId === ride.id ? (
                                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 space-y-3">
                                    <p className="text-xs font-bold text-zinc-500 uppercase">Enter Arrival Time</p>
                                    <div className="flex gap-2">
                                      <input
                                        type="number"
                                        placeholder="Minutes to reach"
                                        className="flex-1 px-4 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                                        value={etaInput}
                                        onChange={e => setEtaInput(e.target.value)}
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleAcceptRide(ride.id)}
                                        disabled={isActionLoading || !etaInput}
                                        className="bg-brand-primary text-white px-6 py-2 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-brand-primary/90 transition-colors shadow-md"
                                      >
                                        {isActionLoading ? '...' : 'Confirm'}
                                      </button>
                                    </div>
                                    <button
                                      onClick={() => { setAcceptingRideId(null); setEtaInput(''); }}
                                      className="w-full text-zinc-400 text-xs font-bold py-1 hover:text-zinc-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <motion.button
                                    onClick={() => preCheckAcceptRide(ride)}
                                    disabled={isActionLoading}
                                    animate={{
                                      scale: [1, 1.05, 1],
                                      rotate: [0, -1, 1, -1, 1, 0],
                                    }}
                                    transition={{
                                      duration: 0.5,
                                      repeat: Infinity,
                                      repeatDelay: 2
                                    }}
                                    className="w-full bg-brand-primary text-white py-3 rounded-xl font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 shadow-lg shadow-indigo-100"
                                  >
                                    Accept Ride
                                  </motion.button>
                                )}
                              </div>
                            )}

                            {ride.status === 'accepted' && ride.driver_id === user.id && (
                              <div className="space-y-3">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Enter Start OTP"
                                    className="flex-1 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm"
                                    value={otpInput}
                                    onChange={e => setOtpInput(e.target.value)}
                                  />
                                  <button
                                    onClick={() => handleStartRide(ride.id)}
                                    disabled={isActionLoading}
                                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                                  >
                                    {isActionLoading ? '...' : 'Start'}
                                  </button>
                                </div>
                                <button
                                  onClick={() => handleCancelRide(ride.id)}
                                  className="w-full text-rose-600 text-xs font-bold py-2"
                                >
                                  Cancel Ride
                                </button>
                              </div>
                            )}

                            {ride.status === 'ongoing' && ride.driver_id === user.id && (
                              <div className="space-y-4">
                                <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-center">
                                  <p className="text-xs font-bold text-emerald-600 uppercase">Ride in Progress</p>
                                  <p className="text-sm font-bold text-emerald-700 font-sans">Estimated Route: <span className="font-extrabold">{ride.distance || 0} KM</span></p>
                                  <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider font-extrabold font-sans">Extra distance: ₹{(VEHICLE_RATES as any)[ride.vehicle_type]?.perKm || 15}/KM</p>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1 font-sans">Actual KM Traveled (Optional)</p>
                                  <input
                                    type="number"
                                    step="0.1"
                                    placeholder={`Enter total KM (Default: ${ride.distance || 0} KM)`}
                                    className="w-full px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none font-medium text-zinc-800"
                                    value={actualKmInput}
                                    onChange={e => setActualKmInput(e.target.value)}
                                  />
                                  <p className="text-[9px] text-zinc-400 leading-normal font-sans">If driven longer than {ride.distance || 0} KM, enter the final actual distance here to auto-charge extra per-KM rate.</p>
                                </div>
                                <div className="space-y-2">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Ride Completion</p>
                                  <div className="flex gap-2">
                                    <input
                                      type="text"
                                      placeholder="Enter End OTP"
                                      className="flex-1 px-4 py-2 bg-white border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                                      value={otpInput}
                                      onChange={e => setOtpInput(e.target.value)}
                                    />
                                    <button
                                      onClick={() => handleCompleteRide(ride.id)}
                                      disabled={isActionLoading || !otpInput}
                                      className="bg-brand-primary text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 shadow-md"
                                    >
                                      {isActionLoading ? '...' : 'Complete Trip'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                            {ride.status === 'completed' && ride.rating && (
                              <div className="mt-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Passenger Rating</p>
                                  <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                                    <Star className="w-3 h-3 fill-current" /> {ride.rating}/5
                                  </div>
                                </div>
                                {ride.review && (
                                  <p className="text-xs text-zinc-600 italic leading-relaxed">"{ride.review}"</p>
                                )}
                              </div>
                            )}
                            {ride.complaint && ride.complaint_forwarded_to_driver && (
                              <div className="mt-3 p-3 bg-rose-50 rounded-xl border border-rose-100 space-y-1">
                                <p className="text-[10px] font-bold text-rose-600 uppercase flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Complaint Received
                                </p>
                                <p className="text-xs text-rose-700 italic leading-relaxed">"{ride.complaint}"</p>
                                {ride.complaint_driver_reply && (
                                  <div className="mt-2 p-2 bg-indigo-50 border border-indigo-100 rounded-lg">
                                    <p className="text-[10px] font-bold text-indigo-600 uppercase">Admin Message for You:</p>
                                    <p className="text-xs text-indigo-700 italic">{ride.complaint_driver_reply}</p>
                                  </div>
                                )}
                                {ride.complaint_driver_response && (
                                  <div className="mt-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                                    <p className="text-[10px] font-bold text-emerald-600 uppercase">Your Response:</p>
                                    <p className="text-xs text-emerald-700 italic">{ride.complaint_driver_response}</p>
                                  </div>
                                )}
                                {!ride.complaint_driver_response && (
                                  <div className="mt-2 space-y-2">
                                    <textarea
                                      placeholder="Write your response to this complaint..."
                                      className="w-full p-2 text-xs border border-rose-200 rounded-lg focus:ring-1 focus:ring-rose-500 outline-none"
                                      rows={2}
                                      id={`driver-response-active-${ride.id}`}
                                    />
                                    <button
                                      onClick={async () => {
                                        const responseInput = document.getElementById(`driver-response-active-${ride.id}`) as HTMLTextAreaElement;
                                        const response = responseInput?.value;
                                        if (!response?.trim()) {
                                          setToast({ message: "Please enter a response", type: 'error' });
                                          return;
                                        }
                                        setIsActionLoading(true);
                                        try {
                                          await updateDoc(doc(db, 'rides', ride.id), {
                                            complaint_driver_response: response,
                                            complaint_status: 'resolved'
                                          });
                                          setToast({ message: "Response sent successfully", type: 'success' });
                                        } catch (err: any) {
                                          handleFirestoreError(err, OperationType.UPDATE, `rides/${ride.id}`);
                                        } finally {
                                          setIsActionLoading(false);
                                        }
                                      }}
                                      disabled={isActionLoading}
                                      className="w-full bg-rose-600 text-white py-1.5 rounded-lg text-[10px] font-bold hover:bg-rose-700 transition-colors disabled:opacity-50"
                                    >
                                      {isActionLoading ? 'Sending...' : 'Send Response'}
                                    </button>
                                  </div>
                                )}
                                <p className={`text-[8px] font-bold uppercase ${ride.complaint_status === 'resolved' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                  Status: {ride.complaint_status || 'pending'}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                    <div className="p-6 border-b border-zinc-100">
                      <h3 className="font-bold text-lg">Wallet History</h3>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {driverWallet.transactions.map((tx: any) => (
                        <div key={tx.id} className="p-4 flex items-center justify-between">
                          <div>
                            <p className="font-bold">{tx.description}</p>
                            <p className="text-xs text-zinc-400">{new Date(tx.created_at).toLocaleString()}</p>
                          </div>
                          <p className={`font-bold ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                      )
                    ) : (
                      <div className="text-center py-20 space-y-4">
                        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto">
                          <Car className="w-10 h-10 text-rose-600" />
                        </div>
                        <h2 className="text-2xl font-bold">Unauthorized Access</h2>
                        <p className="text-zinc-500">You do not have permission to view the Driver Dashboard.</p>
                        <button onClick={() => setView('user')} className="bg-brand-primary text-white px-6 py-2 rounded-xl font-bold shadow-lg">Return to Home</button>
                      </div>
                    )
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          <footer className="max-w-4xl mx-auto px-4 py-12 border-t border-zinc-100 mt-12 mb-8">
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <div className="flex items-center gap-2 text-zinc-400">
                <div className="w-8 h-8 bg-emerald-50 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest">Assistant Support</span>
              </div>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="flex items-center gap-3 group">
                  <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm border border-zinc-100">
                    <Phone className="w-6 h-6 text-zinc-400 transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">whatsapp or call</p>
                    <p className="text-base font-black text-zinc-900 transition-colors">9906361392</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 group">
                  <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm border border-zinc-100">
                    <Phone className="w-6 h-6 text-zinc-400 transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">whatsapp or call</p>
                    <p className="text-base font-black text-zinc-900 transition-colors">7051446392</p>
                  </div>
                </div>
              </div>
              <div className="pt-6 border-t border-zinc-50 w-full">
                <div className="space-y-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
                    © {new Date().getFullYear()} SkyDrive. All Rights Reserved.
                  </p>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.15em] flex items-center gap-2">
                      Made in India <span className="text-base">🇮🇳</span>
                    </p>
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">100% Safe and Secure</p>
                    </div>
                  </div>
                  
                  <div className="pt-4 flex flex-col items-center">
                    <p className="text-[11px] font-black tracking-[0.05em]">
                      <span className="text-zinc-400">Designed and developed by</span>
                      <span className="ml-1.5 bg-gradient-to-r from-zinc-900 to-zinc-500 bg-clip-text text-transparent">Skyline Technologies</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </footer>

      {/* Recharge Modal */}
      <AnimatePresence>
        {isRechargeModalOpen && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16" />
              
              <div className="flex justify-between items-center relative z-10">
                <div>
                  <h2 className="text-2xl font-black">Recharge Wallet</h2>
                  <p className="text-zinc-500 text-sm">Select an amount to recharge</p>
                </div>
                <button onClick={() => setIsRechargeModalOpen(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="max-h-[60vh] overflow-y-auto pr-2 relative z-10 scrollbar-hide">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {rechargeOptions.map((option) => (
                    <button
                      key={option.amount}
                      onClick={() => handleRechargeWallet(option)}
                      className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl hover:border-emerald-500 hover:bg-emerald-50 transition-all text-center group relative overflow-hidden"
                    >
                      <div className="relative z-10">
                        <p className="text-lg font-black text-zinc-900">₹{option.amount}</p>
                        {user?.role === 'driver' && option.freeRides > 0 && (
                          <div className="mt-1">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">
                              + {option.freeRides} Free Ride{option.freeRides > 1 ? 's' : ''} (Under 15km)
                            </p>
                          </div>
                        )}
                      </div>
                      {option.freeRides >= 3 && (
                        <div className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-bold px-2 py-0.5 rounded-bl-lg uppercase">
                          Best Offer
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-900">Instant Credit</p>
                    <p className="text-[10px] text-zinc-500">Amount will be added to your wallet immediately after successful payment.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Review Modal */}
      <AnimatePresence>
        {reviewModal && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                <div>
                  <h3 className="font-bold text-xl">Rate Your Experience</h3>
                  <p className="text-xs opacity-60">How was your ride with {reviewModal.driverName}?</p>
                </div>
                <button onClick={() => setReviewModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="p-2 transition-all hover:scale-110"
                    >
                      <Star 
                        className={`w-10 h-10 ${star <= rating ? 'fill-emerald-500 text-emerald-500' : 'text-zinc-200'}`} 
                      />
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Your Message (Optional)</label>
                  <textarea
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                    placeholder="Tell us about your experience..."
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none min-h-[100px] resize-none"
                  />
                </div>
                <button
                  onClick={handleSubmitReview}
                  disabled={isActionLoading}
                  className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all shadow-xl disabled:opacity-50"
                >
                  {isActionLoading ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Complaint Modal */}
      <AnimatePresence>
        {complaintModal && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-rose-600 text-white">
                <div>
                  <h3 className="font-bold text-xl">File a Complaint</h3>
                  <p className="text-xs opacity-80">Ride ID: {complaintModal.trackingId}</p>
                </div>
                <button onClick={() => setComplaintModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <p className="text-xs text-rose-700 leading-relaxed">
                    We take your safety and experience seriously. Please describe the issue in detail and our team will investigate.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Complaint Details</label>
                  <textarea
                    value={complaintMessage}
                    onChange={(e) => setComplaintMessage(e.target.value)}
                    placeholder="What went wrong? Please be as specific as possible..."
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-rose-500 outline-none min-h-[150px] resize-none"
                  />
                </div>
                <button
                  onClick={handleSubmitComplaint}
                  disabled={isActionLoading || !complaintMessage.trim()}
                  className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold hover:bg-rose-500 transition-all shadow-xl disabled:opacity-50"
                >
                  {isActionLoading ? 'Submitting...' : 'Submit Complaint'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isManualRideModalOpen && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                <div>
                  <h3 className="font-bold text-xl tracking-tight">Manual Ride Entry</h3>
                  <p className="text-xs opacity-60">Add a ride record directly to the database</p>
                </div>
                <button onClick={() => setIsManualRideModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">User Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. John Doe"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.user_name}
                      onChange={e => setManualRideData({...manualRideData, user_name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">User Phone</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 9876543210"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.user_phone}
                      onChange={e => setManualRideData({...manualRideData, user_phone: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Pickup Location</label>
                  <input 
                    type="text" 
                    placeholder="Enter pickup address"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={manualRideData.pickup_location}
                    onChange={e => setManualRideData({...manualRideData, pickup_location: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Dropoff Location</label>
                  <input 
                    type="text" 
                    placeholder="Enter dropoff address"
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={manualRideData.dropoff_location}
                    onChange={e => setManualRideData({...manualRideData, dropoff_location: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Fare (₹)</label>
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.fare}
                      onChange={e => setManualRideData({...manualRideData, fare: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Distance (KM)</label>
                    <input 
                      type="number" 
                      placeholder="0.0"
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.distance}
                      onChange={e => setManualRideData({...manualRideData, distance: e.target.value})}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Trip Type</label>
                    <select 
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.trip_type}
                      onChange={e => setManualRideData({...manualRideData, trip_type: e.target.value as any})}
                    >
                      <option value="single">Single Trip</option>
                      <option value="round">Round Trip</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Status</label>
                    <select 
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.status}
                      onChange={e => setManualRideData({...manualRideData, status: e.target.value as any})}
                    >
                      <option value="pending">Pending</option>
                      <option value="accepted">Accepted</option>
                      <option value="ongoing">Ongoing</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Vehicle Type</label>
                    <select 
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.vehicle_type}
                      onChange={e => setManualRideData({...manualRideData, vehicle_type: e.target.value})}
                    >
                      {Object.keys(VEHICLE_RATES).map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Passengers</label>
                    <select 
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={manualRideData.passengers}
                      onChange={e => setManualRideData({...manualRideData, passengers: e.target.value})}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                        <option key={num} value={num.toString()}>{num} Passenger{num > 1 ? 's' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Assign Driver (Optional)</label>
                  <select 
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={manualRideData.driver_id}
                    onChange={e => setManualRideData({...manualRideData, driver_id: e.target.value})}
                  >
                    <option value="">No Driver Assigned</option>
                    {adminDrivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 bg-zinc-50 flex gap-3">
                <button 
                  onClick={() => setIsManualRideModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold hover:bg-zinc-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleManualAddRide}
                  disabled={isActionLoading}
                  className="flex-1 px-6 py-3 bg-brand-primary text-white rounded-2xl text-sm font-bold hover:bg-brand-primary/90 transition-all shadow-lg disabled:opacity-50"
                >
                  {isActionLoading ? 'Adding...' : 'Add Ride Record'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isForgotPasswordModalOpen && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                <div>
                  <h3 className="font-bold text-xl tracking-tight">Reset Password</h3>
                  <p className="text-xs opacity-60">Reset your {forgotPasswordType} account password</p>
                </div>
                <button onClick={() => setIsForgotPasswordModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Phone Number</label>
                  <input 
                    type="text" 
                    placeholder="Enter registered phone number"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={forgotPasswordData.phone}
                    onChange={e => setForgotPasswordData({...forgotPasswordData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">
                    Verification (Date of Birth)
                  </label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={forgotPasswordData.dob}
                    onChange={e => setForgotPasswordData({...forgotPasswordData, dob: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">New Password</label>
                  <input 
                    type="password" 
                    placeholder="Enter new password"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={forgotPasswordData.newPassword}
                    onChange={e => setForgotPasswordData({...forgotPasswordData, newPassword: e.target.value})}
                  />
                </div>
              </div>
              <div className="p-6 bg-zinc-50 flex gap-3">
                <button 
                  onClick={() => setIsForgotPasswordModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold hover:bg-zinc-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleForgotPassword}
                  disabled={isActionLoading}
                  className="flex-1 px-6 py-3 bg-brand-primary text-white rounded-2xl text-sm font-bold hover:bg-brand-primary/90 transition-all shadow-lg disabled:opacity-50"
                >
                  {isActionLoading ? 'Resetting...' : 'Update Password'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {cancellationModal && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20"
            >
              <div className="p-8 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                <div className="relative z-10">
                  <h3 className="font-black text-2xl tracking-tight">Cancel Ride</h3>
                  <p className="text-xs font-bold opacity-60 uppercase tracking-widest mt-1">Please provide a reason</p>
                </div>
                <button onClick={() => setCancellationModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                {cancellationModal.type === 'user' && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-700 leading-relaxed">
                      WARNING: Cancelling this ride will increase your next ride's fare by 2% and you will lose any available discounts.
                    </p>
                  </div>
                )}
                {cancellationModal.type === 'driver' && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-700 leading-relaxed">
                      Please provide a valid reason for cancelling this ride.
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Cancellation Reason</label>
                  <textarea 
                    placeholder="Why are you cancelling this ride?"
                    className="w-full px-5 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-brand-primary outline-none min-h-[120px] transition-all"
                    value={cancellationReason}
                    onChange={e => setCancellationReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="p-8 bg-zinc-50 flex gap-4">
                <button 
                  onClick={() => setCancellationModal(null)}
                  className="flex-1 px-6 py-4 bg-white border border-zinc-200 rounded-2xl text-sm font-black hover:bg-zinc-100 transition-all shadow-sm active:scale-[0.98]"
                >
                  Go Back
                </button>
                <button 
                  onClick={handleConfirmCancellation}
                  disabled={isActionLoading || !cancellationReason.trim()}
                  className="flex-1 px-6 py-4 bg-rose-600 text-white rounded-2xl text-sm font-black hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 disabled:opacity-50 active:scale-[0.98]"
                >
                  {isActionLoading ? 'Processing...' : 'Confirm Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isEditingNotificationModalOpen && editingNotification && (
          <div className="fixed inset-0 bg-brand-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-brand-dark text-white">
                <div>
                  <h3 className="font-bold text-xl tracking-tight">Edit Notification</h3>
                  <p className="text-xs opacity-60">Update notification message or target</p>
                </div>
                <button onClick={() => setIsEditingNotificationModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Message</label>
                  <textarea 
                    placeholder="Enter notification message"
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none min-h-[100px]"
                    value={editingNotification.message}
                    onChange={e => setEditingNotification({...editingNotification, message: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Target Audience</label>
                  <select 
                    className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                    value={editingNotification.target}
                    onChange={e => setEditingNotification({...editingNotification, target: e.target.value as any})}
                  >
                    <option value="all_drivers">All Drivers</option>
                    <option value="all_users">All Customers</option>
                    <option value="specific_driver">Specific Driver</option>
                    <option value="specific_user">Specific User</option>
                  </select>
                </div>
                {editingNotification.target === 'specific_driver' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Select Driver</label>
                    <select 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={editingNotification.driver_id || ''}
                      onChange={e => setEditingNotification({...editingNotification, driver_id: e.target.value})}
                    >
                      <option value="">Select a driver...</option>
                      {adminDrivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                      ))}
                    </select>
                  </div>
                )}
                {editingNotification.target === 'specific_user' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">Select User</label>
                    <select 
                      className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none"
                      value={editingNotification.user_id || ''}
                      onChange={e => setEditingNotification({...editingNotification, user_id: e.target.value})}
                    >
                      <option value="">Select a user...</option>
                      {adminUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.phone})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="p-6 bg-zinc-50 flex gap-3">
                <button 
                  onClick={() => setIsEditingNotificationModalOpen(false)}
                  className="flex-1 px-6 py-3 bg-white border border-zinc-200 rounded-2xl text-sm font-bold hover:bg-zinc-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpdateNotification}
                  disabled={isActionLoading}
                  className="flex-1 px-6 py-3 bg-brand-primary text-white rounded-2xl text-sm font-bold hover:bg-brand-primary/90 transition-all shadow-lg disabled:opacity-50"
                >
                  {isActionLoading ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
            } text-white`}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
            <button 
              onClick={() => setToast(null)}
              className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-brand-dark/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-zinc-200"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-8 h-8 text-zinc-900" />
                </div>
                <h3 className="text-xl font-bold text-zinc-900">{confirmModal.message}</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmModal(null)}
                    className="flex-1 py-3 rounded-xl font-bold text-zinc-500 bg-zinc-100 hover:bg-zinc-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      confirmModal.onConfirm();
                      setConfirmModal(null);
                    }}
                    className="flex-1 py-3 rounded-xl font-bold text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors shadow-lg shadow-indigo-100"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Modal */}
      <AnimatePresence>
        {activeNotification && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-dark/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-zinc-200"
            >
              <div className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-brand-primary rounded-full flex items-center justify-center mx-auto shadow-lg shadow-indigo-100">
                  <Bell className="w-10 h-10 text-white" />
                </div>
                
                <div className="space-y-2">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">New Notification</p>
                  <h3 className="text-2xl font-bold text-zinc-900 leading-tight">Admin Message</h3>
                </div>

                <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 italic text-zinc-700 leading-relaxed">
                  "{activeNotification.message}"
                </div>

                <button
                  onClick={() => dismissNotification(activeNotification.id)}
                  className="w-full bg-brand-primary text-white py-4 rounded-2xl font-bold hover:bg-brand-primary/90 transition-all shadow-lg shadow-indigo-100 active:scale-[0.98]"
                >
                  Got it, thanks!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div id="recaptcha-container-global" className="hidden"></div>
    </div>
    </ErrorBoundary>
  );
}
