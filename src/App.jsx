import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
} from "firebase/firestore";
import {
  Trophy,
  Users,
  PlusCircle,
  LogIn,
  User,
  ArrowLeft,
  Volume2,
  VolumeX,
  Clock,
  Coins,
  CheckCircle2,
  Flame,
  Crown,
  Copy,
  Check,
  LogOut,
  Sparkles,
  Swords,
  Award,
  Settings,
  Edit3,
  Save,
  TrendingUp,
  Medal,
  Activity,
  UserPlus,
  UserCheck,
  X,
  Bot,
  AlertTriangle,
} from "lucide-react";

// --- Firebase 設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyBQyvZ7BPAttBd5tty9oquiX5vCz_m3Ad0",
  authDomain: "studytime-8d240.firebaseapp.com",
  projectId: "studytime-8d240",
  storageBucket: "studytime-8d240.firebasestorage.app",
  messagingSenderId: "686516235281",
  appId: "1:686516235281:web:2fe23adb304a2a8fc3d5b0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "poker-app-v1";

// --- トランプカード & ユーティリティ ---
const SUITS = ["S", "H", "D", "C"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = {
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
  J: 11, Q: 12, K: 13, A: 14,
};
const CARD_SUITS = {
  S: { symbol: "♠", color: "text-slate-900 dark:text-slate-100" },
  H: { symbol: "♥", color: "text-red-600" },
  D: { symbol: "♦", color: "text-blue-600" },
  C: { symbol: "♣", color: "text-emerald-600" },
};

function createShuffledDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function evaluate7Cards(cards) {
  if (!cards || cards.length < 5) return { rank: 0, name: "High Card", score: 0 };
  const parsed = cards
    .map((c) => ({ val: RANK_VALUES[c.rank], suit: c.suit, raw: c }))
    .sort((a, b) => b.val - a.val);
  const suitCounts = {};
  parsed.forEach((c) => (suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1));
  const flushSuit = Object.keys(suitCounts).find((s) => suitCounts[s] >= 5);
  const flushCards = flushSuit ? parsed.filter((c) => c.suit === flushSuit) : null;
  const checkStraight = (cardList) => {
    const uniqueVals = Array.from(new Set(cardList.map((c) => c.val))).sort(
      (a, b) => b - a
    );
    if (uniqueVals.includes(14)) uniqueVals.push(1);
    for (let i = 0; i <= uniqueVals.length - 5; i++) {
      if (
        uniqueVals[i] - 1 === uniqueVals[i + 1] &&
        uniqueVals[i + 1] - 1 === uniqueVals[i + 2] &&
        uniqueVals[i + 2] - 1 === uniqueVals[i + 3] &&
        uniqueVals[i + 3] - 1 === uniqueVals[i + 4]
      ) {
        return uniqueVals[i];
      }
    }
    return 0;
  };
  const straightHigh = checkStraight(parsed);
  const straightFlushHigh = flushCards ? checkStraight(flushCards) : 0;
  if (straightFlushHigh === 14)
    return { rank: 10, name: "Royal Flush", score: 1000000 };
  if (straightFlushHigh > 0)
    return { rank: 9, name: "Straight Flush", score: 900000 + straightFlushHigh };
  const valCounts = {};
  parsed.forEach((c) => (valCounts[c.val] = (valCounts[c.val] || 0) + 1));
  const fourOfAKind = Object.keys(valCounts).find((v) => valCounts[v] === 4);
  if (fourOfAKind)
    return { rank: 8, name: "Four of a Kind", score: 800000 + Number(fourOfAKind) };
  const threes = Object.keys(valCounts)
    .filter((v) => valCounts[v] === 3)
    .map(Number)
    .sort((a, b) => b - a);
  const pairs = Object.keys(valCounts)
    .filter((v) => valCounts[v] === 2)
    .map(Number)
    .sort((a, b) => b - a);
  if (threes.length >= 2 || (threes.length === 1 && pairs.length >= 1)) {
    const mainThree = threes[0];
    const mainPair = threes[1] || pairs[0];
    return { rank: 7, name: "Full House", score: 700000 + mainThree * 10 + mainPair };
  }
  if (flushCards) return { rank: 6, name: "Flush", score: 600000 + flushCards[0].val };
  if (straightHigh > 0)
    return { rank: 5, name: "Straight", score: 500000 + straightHigh };
  if (threes.length === 1)
    return { rank: 4, name: "Three of a Kind", score: 400000 + threes[0] };
  if (pairs.length >= 2)
    return { rank: 3, name: "Two Pair", score: 300000 + pairs[0] * 10 + pairs[1] };
  if (pairs.length === 1)
    return { rank: 2, name: "One Pair", score: 200000 + pairs[0] };
  return { rank: 1, name: "High Card", score: 100000 + parsed[0].val };
}

function calculateElo(myRating, opponentRating, isWin) {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
  const actualScore = isWin ? 1 : 0;
  return Math.round(myRating + K * (actualScore - expectedScore));
}

const AI_PROFILES = [
  { id: "ai_1", name: "Alpha", rating: 1210 },
  { id: "ai_2", name: "Bravo", rating: 1250 },
  { id: "ai_3", name: "Charlie", rating: 1280 },
  { id: "ai_4", name: "Delta", rating: 1320 },
  { id: "ai_5", name: "Echo", rating: 1350 },
  { id: "ai_6", name: "Foxtrot", rating: 1390 },
  { id: "ai_7", name: "Golf", rating: 1420 },
  { id: "ai_8", name: "Hotel", rating: 1450 },
  { id: "ai_9", name: "India", rating: 1480 },
  { id: "ai_10", name: "Juliet", rating: 1510 },
  { id: "ai_11", name: "Kilo", rating: 1540 },
  { id: "ai_12", name: "Lima", rating: 1580 },
  { id: "ai_13", name: "Mike", rating: 1610 },
  { id: "ai_14", name: "November", rating: 1650 },
  { id: "ai_15", name: "Oscar", rating: 1690 },
  { id: "ai_16", name: "Papa", rating: 1720 },
  { id: "ai_17", name: "Quebec", rating: 1750 },
  { id: "ai_18", name: "Romeo", rating: 1770 },
  { id: "ai_19", name: "Sierra", rating: 1790 },
  { id: "ai_20", name: "Tango", rating: 1800 },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState("menu");
  const [gameMode, setGameMode] = useState("ranked");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [currentRoomCode, setCurrentRoomCode] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [copied, setCopied] = useState(false);

  const [userProfile, setUserProfile] = useState({
    id: "",
    name: "Player",
    rating: 1000,
    peakRating: 1000,
    chips: 2000,
    gamesPlayed: 0,
    gamesWon: 0,
    currentWinStreak: 0,
    maxWinStreak: 0,
    version: "1.0",
  });
  const [editName, setEditName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  const [friendsList, setFriendsList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friendTab, setFriendTab] = useState("list");

  const [matchResult, setMatchResult] = useState(null);
  const [raiseAmount, setRaiseAmount] = useState(100);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isMatching, setIsMatching] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Auth & Init
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    const initAIs = async () => {
      try {
        const sysRef = doc(db, "artifacts", appId, "public", "data", "sys", "ai_init");
        const snap = await getDoc(sysRef);
        if (!snap.exists()) {
          for (const ai of AI_PROFILES) {
            const lbRef = doc(db, "artifacts", appId, "public", "data", "leaderboard", ai.id);
            await setDoc(lbRef, {
              name: ai.name,
              rating: ai.rating,
              peakRating: ai.rating,
              maxWinStreak: 0,
              isAI: true,
            });
          }
          await setDoc(sysRef, { initialized: true });
        }
      } catch (e) {
        console.error("AI Init Error:", e);
      }
    };
    initAIs();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Profile & Friends Watch
  useEffect(() => {
    if (!user) return;
    const userProfileRef = doc(db, "artifacts", appId, "users", user.uid, "profile", "data");
    const unsubProfile = onSnapshot(userProfileRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserProfile((prev) => ({ ...prev, id: user.uid, ...data }));
        setEditName(data.name || "");
        if (data.version !== "1.1") {
          setShowUpdateModal(true);
        }
      } else {
        const initialProfile = {
          name: "Player " + Math.floor(100 + Math.random() * 900),
          rating: 1000,
          peakRating: 1000,
          chips: 2000,
          gamesPlayed: 0,
          gamesWon: 0,
          currentWinStreak: 0,
          maxWinStreak: 0,
          version: "1.0",
        };
        await setDoc(userProfileRef, initialProfile, { merge: true });
        const lbRef = doc(db, "artifacts", appId, "public", "data", "leaderboard", user.uid);
        await setDoc(
          lbRef,
          {
            name: initialProfile.name,
            rating: initialProfile.rating,
            peakRating: initialProfile.peakRating,
            maxWinStreak: initialProfile.maxWinStreak,
          },
          { merge: true }
        );
        setEditName(initialProfile.name);
        setShowUpdateModal(true);
      }
    });

    const friendsColRef = collection(db, "artifacts", appId, "users", user.uid, "friends");
    const unsubFriends = onSnapshot(friendsColRef, (snap) => {
      const allFriends = [];
      snap.forEach((d) => allFriends.push({ id: d.id, ...d.data() }));
      setFriendsList(allFriends.filter((f) => f.status === "accepted"));
      setPendingRequests(allFriends.filter((f) => f.status === "pending"));
      setSentRequests(allFriends.filter((f) => f.status === "sent"));
    });
    return () => {
      unsubProfile();
      unsubFriends();
    };
  }, [user]);

  // Leaderboard
  useEffect(() => {
    if (currentScreen === "profile") {
      const fetchLeaderboard = async () => {
        try {
          const lbCol = collection(db, "artifacts", appId, "public", "data", "leaderboard");
          const snap = await getDocs(lbCol);
          const lb = [];
          snap.forEach((docSnap) => lb.push({ id: docSnap.id, ...docSnap.data() }));
          lb.sort((a, b) => (b.peakRating || b.rating || 0) - (a.peakRating || a.rating || 0));
          setLeaderboard(lb);
        } catch (e) {
          console.error(e);
        }
      };
      fetchLeaderboard();
    }
  }, [currentScreen]);

  // 切断ペナルティ警告
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (currentScreen === "game" && roomData?.status === "playing" && roomData?.mode === "ranked") {
        const meInRoom = roomData.players.find((p) => p.id === user?.uid);
        if (meInRoom && !meInRoom.isFolded) {
          e.preventDefault();
          e.returnValue = "試合中にページを離れるとレーティングが減少する可能性があります。";
        }
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [currentScreen, roomData, user]);

  const closeUpdateModal = async () => {
    setShowUpdateModal(false);
    if (user) {
      const userProfileRef = doc(db, "artifacts", appId, "users", user.uid, "profile", "data");
      await updateDoc(userProfileRef, { version: "1.1" });
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !editName.trim()) return;
    setIsSavingProfile(true);
    try {
      const userProfileRef = doc(db, "artifacts", appId, "users", user.uid, "profile", "data");
      await updateDoc(userProfileRef, { name: editName.trim() });
      const lbRef = doc(db, "artifacts", appId, "public", "data", "leaderboard", user.uid);
      await setDoc(lbRef, { name: editName.trim() }, { merge: true });
      alert("プロフィールを保存しました！");
    } catch (e) {
      console.error(e);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const sendFriendRequest = async (targetUserId, targetUserName) => {
    if (!user || user.uid === targetUserId) return;
    try {
      const myFriendRef = doc(db, "artifacts", appId, "users", user.uid, "friends", targetUserId);
      await setDoc(myFriendRef, { name: targetUserName, status: "sent", timestamp: Date.now() });
      const targetFriendRef = doc(db, "artifacts", appId, "users", targetUserId, "friends", user.uid);
      await setDoc(targetFriendRef, { name: userProfile.name, status: "pending", timestamp: Date.now() });
      alert(`${targetUserName}さんにフレンド申請を送りました！`);
    } catch (e) {
      console.error(e);
    }
  };

  const acceptFriendRequest = async (requesterId, requesterName) => {
    if (!user) return;
    try {
      const myFriendRef = doc(db, "artifacts", appId, "users", user.uid, "friends", requesterId);
      await updateDoc(myFriendRef, { status: "accepted", timestamp: Date.now() });
      const targetFriendRef = doc(db, "artifacts", appId, "users", requesterId, "friends", user.uid);
      await updateDoc(targetFriendRef, { status: "accepted", timestamp: Date.now(), name: userProfile.name });
    } catch (e) {
      console.error(e);
    }
  };

  const removeOrDeclineFriend = async (targetId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "artifacts", appId, "users", user.uid, "friends", targetId));
      await deleteDoc(doc(db, "artifacts", appId, "users", targetId, "friends", user.uid));
    } catch (e) {
      console.error(e);
    }
  };

  // Room & Game Sync
  useEffect(() => {
    if (!user || !currentRoomCode) return;
    const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", currentRoomCode);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoomData(data);
        if (data.status === "playing" && currentScreen !== "game") setCurrentScreen("game");
        else if (data.status === "waiting" && currentScreen === "game") setCurrentScreen("lobby");
        else if (data.status === "showdown" && currentScreen === "game") handleShowdownEvaluation(data);
      } else {
        if (currentScreen === "lobby" || currentScreen === "game") {
          alert("ルームが解散されたか、存在しません。");
          setCurrentScreen("menu");
          setCurrentRoomCode(null);
        }
      }
    });
    return () => unsubscribe();
  }, [user, currentRoomCode, currentScreen]);

  useEffect(() => {
    let timer;
    if (currentScreen === "game" && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [currentScreen, timeLeft]);

  // AI Action
  useEffect(() => {
    if (currentScreen === "game" && roomData && roomData.status === "playing") {
      const activePlayer = roomData.players[roomData.turnIndex];
      if (activePlayer && activePlayer.isAI && !activePlayer.isFolded && roomData.hostId === user?.uid) {
        const timerId = setTimeout(() => {
          processAITurn(roomData, activePlayer);
        }, 1500 + Math.random() * 1000);
        return () => clearTimeout(timerId);
      }
    }
  }, [roomData, currentScreen, user]);

  const processAITurn = async (room, aiPlayer) => {
    const currentCall = room.currentCall;
    const myBet = aiPlayer.currentBet || 0;
    const toCall = currentCall - myBet;
    const smartness = Math.max(0, Math.min(1, (aiPlayer.rating - 1200) / 600));

    let handStrength = 0;
    if (room.phase === "preflop") {
      const v1 = RANK_VALUES[aiPlayer.cards[0].rank];
      const v2 = RANK_VALUES[aiPlayer.cards[1].rank];
      handStrength = ((v1 + v2) / 28) * 0.5 + (v1 === v2 ? 0.5 : 0);
    } else {
      const evalRes = evaluate7Cards([...aiPlayer.cards, ...(room.communityCards || [])]);
      handStrength = Math.min(1, (evalRes.rank - 1) / 7);
    }

    let action = "fold";
    let raiseVal = 0;
    const rand = Math.random();

    if (toCall === 0) {
      if (handStrength > 0.6 + (1 - smartness) * 0.3 && rand > 0.5) {
        action = "raise";
        raiseVal = currentCall + Math.max(50, Math.floor(room.pot * 0.5));
      } else if (smartness > 0.7 && rand < 0.2 && handStrength < 0.3) {
        action = "raise";
        raiseVal = currentCall + 50;
      } else {
        action = "call";
      }
    } else {
      const potOdds = toCall / (room.pot + toCall);
      if (handStrength > 0.8 && rand > 0.3) {
        action = "raise";
        raiseVal = currentCall + Math.max(50, Math.floor(room.pot * 0.5));
      } else if (handStrength > potOdds * (1.5 - smartness) || rand < 0.2 * (1 - smartness)) {
        action = "call";
      } else {
        action = "fold";
      }
    }

    if (action === "raise") {
      const maxCanBet = aiPlayer.chips + myBet;
      if (raiseVal > maxCanBet) raiseVal = maxCanBet;
      if (raiseVal <= currentCall) action = "call";
    }
    await executePlayerAction(room.code, aiPlayer.id, action, raiseVal);
  };

  const executePlayerAction = async (roomCode, playerId, actionType, betValue = 0) => {
    try {
      const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", roomCode);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return;
      const room = snap.data();

      const myIndex = room.players.findIndex((p) => p.id === playerId);
      if (myIndex === -1 || room.turnIndex !== myIndex) return;

      let updatedPlayers = [...room.players];
      let newPot = room.pot;
      let newCall = room.currentCall;

      updatedPlayers[myIndex].acted = true;

      if (actionType === "fold") {
        updatedPlayers[myIndex].isFolded = true;
      } else if (actionType === "call") {
        const needed = Math.min(newCall - updatedPlayers[myIndex].currentBet, updatedPlayers[myIndex].chips);
        updatedPlayers[myIndex].chips -= needed;
        updatedPlayers[myIndex].currentBet += needed;
        newPot += needed;
      } else if (actionType === "raise") {
        const added = Math.min(betValue - updatedPlayers[myIndex].currentBet, updatedPlayers[myIndex].chips);
        updatedPlayers[myIndex].chips -= added;
        updatedPlayers[myIndex].currentBet += added;
        newCall = updatedPlayers[myIndex].currentBet;
        newPot += added;
        updatedPlayers.forEach((p, idx) => {
          if (idx !== myIndex && !p.isFolded && p.chips > 0) p.acted = false;
        });
      }

      let nextTurnIndex = (room.turnIndex + 1) % updatedPlayers.length;
      while (updatedPlayers[nextTurnIndex].isFolded && updatedPlayers.filter((p) => !p.isFolded).length > 1) {
        nextTurnIndex = (nextTurnIndex + 1) % updatedPlayers.length;
      }

      const activePlayers = updatedPlayers.filter((p) => !p.isFolded);
      const allMatched = activePlayers.every((p) => p.acted && (p.currentBet === newCall || p.chips === 0));

      if (activePlayers.length <= 1) {
        await updateDoc(roomRef, { status: "showdown", pot: newPot, players: updatedPlayers });
        return;
      }

      if (allMatched) {
        let nextPhase = "flop";
        let showCards = [];
        if (room.phase === "preflop") {
          nextPhase = "flop";
          showCards = room.allCommunityCards.slice(0, 3);
        } else if (room.phase === "flop") {
          nextPhase = "turn";
          showCards = room.allCommunityCards.slice(0, 4);
        } else if (room.phase === "turn") {
          nextPhase = "river";
          showCards = room.allCommunityCards.slice(0, 5);
        } else if (room.phase === "river") {
          await updateDoc(roomRef, { status: "showdown", pot: newPot, players: updatedPlayers });
          return;
        }

        let firstActiveIndex = 0;
        while (firstActiveIndex < updatedPlayers.length && updatedPlayers[firstActiveIndex].isFolded) {
          firstActiveIndex++;
        }

        await updateDoc(roomRef, {
          phase: nextPhase,
          communityCards: showCards,
          pot: newPot,
          currentCall: 0,
          turnIndex: firstActiveIndex % updatedPlayers.length,
          players: updatedPlayers.map((p) => ({ ...p, currentBet: 0, acted: false })),
        });
      } else {
        await updateDoc(roomRef, { players: updatedPlayers, pot: newPot, currentCall: newCall, turnIndex: nextTurnIndex });
      }
      setTimeLeft(15);
    } catch (e) {
      console.error(e);
    }
  };

  const handleShowdownEvaluation = async (room) => {
    if (!user) return;
    const evaluatedPlayers = room.players.map((p) => {
      if (p.isFolded) return { ...p, eval: { rank: 0, name: "Folded", score: -1 } };
      return { ...p, eval: evaluate7Cards([...(p.cards || []), ...(room.allCommunityCards || [])]) };
    });

    const activePlayers = evaluatedPlayers.filter((p) => !p.isFolded).sort((a, b) => b.eval.score - a.eval.score);
    const winner = activePlayers[0];
    const isIWinner = winner?.id === user.uid;

    let result = {
      isWin: isIWinner,
      winnerName: winner?.name,
      handName: winner?.eval.name,
      potWon: room.pot,
      newRating: userProfile.rating,
      change: 0,
      opponents: room.players.filter((p) => p.id !== user.uid),
    };

    if (room.mode === "ranked") {
      for (const p of room.players) {
        const opps = room.players.filter((x) => x.id !== p.id);
        const avgOppRating = opps.length > 0 ? opps.reduce((acc, x) => acc + x.rating, 0) / opps.length : 1000;
        const newRate = calculateElo(p.rating, avgOppRating, p.id === winner?.id);

        if (p.id === user.uid) {
          const change = newRate - userProfile.rating;
          result.newRating = newRate;
          result.change = change;
          const upData = {
            rating: newRate,
            peakRating: Math.max(userProfile.peakRating || 1000, newRate),
            chips: userProfile.chips + (isIWinner ? room.pot : 0),
            gamesPlayed: userProfile.gamesPlayed + 1,
            gamesWon: userProfile.gamesWon + (isIWinner ? 1 : 0),
            currentWinStreak: isIWinner ? userProfile.currentWinStreak + 1 : 0,
            maxWinStreak: isIWinner ? Math.max(userProfile.maxWinStreak, userProfile.currentWinStreak + 1) : userProfile.maxWinStreak,
          };
          await updateDoc(doc(db, "artifacts", appId, "users", user.uid, "profile", "data"), upData);
          await setDoc(
            doc(db, "artifacts", appId, "public", "data", "leaderboard", user.uid),
            { name: userProfile.name, rating: newRate, peakRating: upData.peakRating, maxWinStreak: upData.maxWinStreak },
            { merge: true }
          );
        } else if (p.isAI && room.hostId === user.uid) {
          const aiDocRef = doc(db, "artifacts", appId, "public", "data", "leaderboard", p.id);
          const aiSnap = await getDoc(aiDocRef);
          if (aiSnap.exists()) {
            const aiData = aiSnap.data();
            await updateDoc(aiDocRef, { rating: newRate, peakRating: Math.max(aiData.peakRating || 1000, newRate) });
          }
        }
      }
    } else {
      if (isIWinner) {
        await updateDoc(doc(db, "artifacts", appId, "users", user.uid, "profile", "data"), {
          chips: userProfile.chips + room.pot,
        });
      }
    }
    setMatchResult(result);
    setCurrentScreen("result");
  };

  const handleJoinRankedMatch = async () => {
    if (!user) return;
    setIsMatching(true);
    setGameMode("ranked");
    try {
      const roomsCol = collection(db, "artifacts", appId, "public", "data", "rooms");
      const snapshot = await getDocs(roomsCol);
      let targetRoom = null;
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.mode === "ranked" && data.status === "waiting" && data.players.length < 6) {
          targetRoom = { id: docSnap.id, ...data };
        }
      });

      if (targetRoom) {
        if (!targetRoom.players.some((p) => p.id === user.uid)) {
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "rooms", targetRoom.id), {
            players: arrayUnion({
              id: user.uid,
              name: userProfile.name,
              rating: userProfile.rating,
              chips: userProfile.chips,
              isReady: true,
              isFolded: false,
              acted: false,
              currentBet: 0,
              cards: [],
            }),
          });
        }
        setCurrentRoomCode(targetRoom.id);
        setCurrentScreen("lobby");
      } else {
        const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
        await setDoc(doc(db, "artifacts", appId, "public", "data", "rooms", generatedCode), {
          code: generatedCode,
          hostId: user.uid,
          mode: "ranked",
          status: "waiting",
          phase: "preflop",
          players: [
            {
              id: user.uid,
              name: userProfile.name,
              rating: userProfile.rating,
              chips: userProfile.chips,
              isReady: true,
              isFolded: false,
              acted: false,
              currentBet: 0,
              cards: [],
              isAI: false,
            },
          ],
          communityCards: [],
          allCommunityCards: [],
          pot: 0,
          currentCall: 50,
          turnIndex: 0,
          createdAt: Date.now(),
        });
        setCurrentRoomCode(generatedCode);
        setCurrentScreen("lobby");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsMatching(false);
    }
  };

  const handleNextRankedMatch = async () => {
    if (user && currentRoomCode && roomData) {
      try {
        const meInRoom = roomData.players.find((p) => p.id === user.uid);
        if (meInRoom) {
          await updateDoc(doc(db, "artifacts", appId, "public", "data", "rooms", currentRoomCode), {
            players: arrayRemove(meInRoom),
          });
        }
      } catch (e) {}
    }
    setCurrentRoomCode(null);
    setRoomData(null);
    handleJoinRankedMatch();
  };

  const createRoomBase = async (mode) => {
    if (!user) return;
    const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newRoomData = {
      code: generatedCode,
      hostId: user.uid,
      mode: mode,
      status: "waiting",
      phase: "preflop",
      players: [
        {
          id: user.uid,
          name: userProfile.name,
          rating: userProfile.rating,
          chips: userProfile.chips,
          isReady: true,
          isFolded: false,
          currentBet: 0,
          cards: [],
        },
      ],
      communityCards: [],
      allCommunityCards: [],
      pot: 0,
      currentCall: 50,
      turnIndex: 0,
      createdAt: Date.now(),
    };
    try {
      const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", generatedCode);
      await setDoc(roomRef, newRoomData);
      setCurrentRoomCode(generatedCode);
      setCurrentScreen("lobby");
    } catch (e) {
      console.error(e);
    }
  };

  const toggleReady = async () => {
    if (!user || !currentRoomCode || !roomData) return;
    const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", currentRoomCode);
    const updatedPlayers = roomData.players.map((p) => {
      if (p.id === user.uid) return { ...p, isReady: !p.isReady };
      return p;
    });
    await updateDoc(roomRef, { players: updatedPlayers });
  };

  const handleStartGame = async () => {
    if (!user || !currentRoomCode || !roomData) return;

    let finalPlayers = [...roomData.players];
    if (roomData.mode === "ranked" && finalPlayers.length < 6) {
      const lbCol = collection(db, "artifacts", appId, "public", "data", "leaderboard");
      const lbSnap = await getDocs(lbCol);
      const allAIs = [];
      lbSnap.forEach((d) => {
        if (d.data().isAI) allAIs.push({ id: d.id, ...d.data() });
      });
      if (allAIs.length === 0) allAIs.push(...AI_PROFILES.map((ai) => ({ ...ai, isAI: true })));

      const missing = 6 - finalPlayers.length;
      const selectedAIs = allAIs.sort(() => 0.5 - Math.random()).slice(0, missing);
      const aiPlayers = selectedAIs.map((ai) => ({
        id: ai.id,
        name: ai.name,
        rating: ai.rating,
        chips: 2000,
        isReady: true,
        isFolded: false,
        acted: false,
        currentBet: 0,
        cards: [],
        isAI: true,
      }));
      finalPlayers = [...finalPlayers, ...aiPlayers];
    }

    const roomRef = doc(db, "artifacts", appId, "public", "data", "rooms", currentRoomCode);
    const deck = createShuffledDeck();

    const updatedPlayers = finalPlayers.map((p) => ({
      ...p,
      isFolded: false,
      acted: false,
      currentBet: 50,
      chips: p.chips - 50,
      cards: [deck.pop(), deck.pop()],
    }));
    const allCommunity = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];

    await updateDoc(roomRef, {
      status: "playing",
      phase: "preflop",
      players: updatedPlayers,
      communityCards: [],
      allCommunityCards: allCommunity,
      pot: updatedPlayers.length * 50,
      currentCall: 50,
      turnIndex: 0,
    });
    setTimeLeft(15);
  };

  const handleLeaveRoom = async () => {
    if (!user || !currentRoomCode || !roomData) return setCurrentScreen("menu");
    if (roomData.status === "playing" && roomData.mode === "ranked") {
      const meInRoom = roomData.players.find((p) => p.id === user.uid);
      if (meInRoom && !meInRoom.isFolded) {
        const confirmLeave = window.confirm(
          "【警告】試合中に退出すると、レーティングが 20 減少します。\n本当に退出しますか？"
        );
        if (!confirmLeave) return;

        const newRating = Math.max(0, userProfile.rating - 20);
        await updateDoc(doc(db, "artifacts", appId, "users", user.uid, "profile", "data"), { rating: newRating });
        await setDoc(
          doc(db, "artifacts", appId, "public", "data", "leaderboard", user.uid),
          { rating: newRating },
          { merge: true }
        );
        setUserProfile((prev) => ({ ...prev, rating: newRating }));
        alert("試合を放棄したため、レーティングが 20 減少しました。");
      }
    }
    try {
      const meInRoom = roomData.players.find((p) => p.id === user.uid);
      if (meInRoom) {
        await updateDoc(doc(db, "artifacts", appId, "public", "data", "rooms", currentRoomCode), {
          players: arrayRemove(meInRoom),
        });
      }
    } catch (e) {
    } finally {
      setCurrentRoomCode(null);
      setRoomData(null);
      setCurrentScreen("menu");
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentRoomCode || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const myPlayerData = roomData?.players?.find((p) => p.id === user?.uid);
  const isMyTurn = roomData?.players?.[roomData?.turnIndex]?.id === user?.uid;

  // --- UI Components ---
  const Card = ({ rank, suit, hidden = false, className = "" }) => {
    if (hidden || !rank || !suit)
      return (
        <div
          className={`w-10 h-14 sm:w-14 sm:h-20 bg-gradient-to-br from-blue-700 to-indigo-900 rounded-lg border border-white/40 shadow-lg flex items-center justify-center shrink-0 ${className}`}
        >
          <div className="w-6 h-10 border border-white/20 rounded flex items-center justify-center opacity-40">
            <div className="text-white text-[10px] font-bold">♠</div>
          </div>
        </div>
      );
    const suitInfo = CARD_SUITS[suit] || CARD_SUITS.S;
    return (
      <div
        className={`w-10 h-14 sm:w-14 sm:h-20 bg-white text-slate-900 rounded-lg border border-slate-300 shadow-md flex flex-col justify-between p-1 select-none font-bold relative shrink-0 ${className}`}
      >
        <div className={`text-[10px] sm:text-xs leading-none ${suitInfo.color}`}>
          {rank}
          <br />
          {suitInfo.symbol}
        </div>
        <div className={`text-sm sm:text-xl self-center ${suitInfo.color}`}>
          {suitInfo.symbol}
        </div>
        <div className={`text-[10px] sm:text-xs leading-none self-end rotate-180 ${suitInfo.color}`}>
          {rank}
          <br />
          {suitInfo.symbol}
        </div>
      </div>
    );
  };

  const PlayerSeat = ({
    name,
    chips,
    rating,
    cards,
    isCurrent,
    isDealer,
    isFolded,
    position,
    isUser = false,
    isAI = false,
  }) => (
    <div
      className={`absolute ${position} flex flex-col items-center transition-all duration-300 z-10 ${
        isFolded ? "opacity-40 grayscale" : ""
      }`}
    >
      {isDealer && (
        <div className="absolute -top-2.5 -left-2.5 bg-amber-400 text-black text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center border border-white shadow z-20">
          D
        </div>
      )}
      <div className="flex -space-x-3 mb-1">
        {cards && cards.length > 0 ? (
          cards.map((c, i) => (
            <Card
              key={i}
              rank={c.rank}
              suit={c.suit}
              hidden={c.hidden}
              className={isUser ? "transform hover:-translate-y-2 shadow-xl" : ""}
            />
          ))
        ) : (
          <>
            <Card hidden />
            <Card hidden />
          </>
        )}
      </div>
      <div
        className={`w-24 sm:w-28 bg-slate-900/90 backdrop-blur-md rounded-xl p-1 border ${
          isCurrent ? "border-amber-400 ring-2 ring-amber-400/50" : "border-slate-700"
        } shadow-lg text-center`}
      >
        <div className="text-[10px] sm:text-xs font-semibold text-slate-200 truncate flex items-center justify-center gap-0.5">
          {isUser && <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
          {isAI && <Bot className="w-2.5 h-2.5 text-indigo-400 shrink-0" />}
          <span className="truncate">{name}</span>
        </div>
        <div className="text-amber-400 font-bold text-[10px] sm:text-xs flex items-center justify-center gap-0.5">
          <Coins className="w-2.5 h-2.5" />${chips}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full flex justify-center h-[100dvh] overflow-hidden bg-slate-950 relative">
      
      {/* アップデートモーダル */}
      {showUpdateModal && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl max-w-sm w-full space-y-5 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-amber-600"></div>
            <div className="flex items-center gap-3 text-amber-400 mb-2">
              <Sparkles className="w-6 h-6" />
              <h2 className="text-xl font-black">Ver 1.1 アップデート</h2>
            </div>
            <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
              <p className="font-bold text-white text-base">正式リリースをしました！🎉</p>
              <ul className="space-y-2 list-disc pl-4">
                <li>
                  <strong className="text-amber-200">ランク戦の待機ルーム追加</strong>
                  <br />
                  他のプレイヤーと対戦可能になり、不足人数にはAIが自動参戦します。
                </li>
                <li>
                  <strong className="text-amber-200">切断ペナルティの追加</strong>
                  <br />
                  試合中に意図的な退出を行うとレーティングが 20 減少します。
                </li>
              </ul>
            </div>
            <button
              onClick={closeUpdateModal}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2 mt-2"
            >
              <CheckCircle2 className="w-5 h-5" /> 確認してはじめる
            </button>
          </div>
        </div>
      )}

      {/* メインコンテナ */}
      <div className="w-full max-w-md bg-slate-900 h-full flex flex-col relative shadow-2xl border-x border-slate-800">
        
        {/* ヘッダー */}
        <header className="px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-20 shrink-0">
          <div className="flex items-center gap-2">
            {currentScreen !== "menu" && (
              <button
                onClick={() =>
                  ["profile", "friends"].includes(currentScreen)
                    ? setCurrentScreen("menu")
                    : handleLeaveRoom()
                }
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="font-extrabold text-lg tracking-wider bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              HOLD'EM ROYAL
            </div>
          </div>
          <div className="flex items-center gap-3">
            {currentScreen === "menu" && (
              <button
                onClick={() => setCurrentScreen("friends")}
                className="p-1.5 relative rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <Users className="w-5 h-5" />
                {pendingRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-pulse" />
                )}
              </button>
            )}
            <div
              className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-full text-xs font-medium border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
              onClick={() => setCurrentScreen("profile")}
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>{userProfile.rating}</span>
            </div>
          </div>
        </header>

        {/* --- 1. メインメニュー --- */}
        {currentScreen === "menu" && (
          <main className="flex-1 p-4 flex flex-col justify-between overflow-y-auto">
            <div
              className="bg-gradient-to-br from-slate-800 to-slate-850 rounded-2xl p-4 border border-slate-700 shadow-lg cursor-pointer relative"
              onClick={() => setCurrentScreen("profile")}
            >
              <div className="absolute top-4 right-4 text-slate-400 hover:text-white">
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 flex items-center justify-center shadow">
                  <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-amber-400" />
                  </div>
                </div>
                <div>
                  <h2 className="font-bold text-slate-100">{userProfile.name}</h2>
                  <p className="text-[10px] text-slate-400 font-mono">
                    UID: {user?.uid ? user.uid.substring(0, 8) + "..." : "---"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-700/60 text-center">
                <div className="bg-slate-900/50 p-2 rounded-xl col-span-2">
                  <span className="text-[10px] text-slate-400 block">レーティング</span>
                  <span className="text-sm font-bold text-amber-400">{userProfile.rating}</span>
                </div>
                <div className="bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block">所持チップ</span>
                  <span className="text-sm font-bold text-emerald-400">${userProfile.chips}</span>
                </div>
                <div className="bg-slate-900/50 p-2 rounded-xl">
                  <span className="text-[10px] text-slate-400 block">勝率</span>
                  <span className="text-sm font-bold text-blue-400">
                    {userProfile.gamesPlayed > 0
                      ? Math.round((userProfile.gamesWon / userProfile.gamesPlayed) * 100)
                      : 0}
                    %
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 my-auto py-4">
              <button
                onClick={handleJoinRankedMatch}
                disabled={isMatching}
                className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 p-4 text-left shadow-lg transition-transform active:scale-95 disabled:opacity-75"
              >
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-3 bg-black/20 rounded-xl text-amber-100">
                    {isMatching ? <Clock className="w-6 h-6 animate-spin" /> : <Flame className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="font-bold text-lg text-slate-950 flex items-center gap-2">
                      {isMatching ? "マッチング中..." : "ランクマッチ"}
                      {!isMatching && (
                        <span className="bg-slate-950/20 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black">
                          AI自動補充
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-900/80">他のプレイヤーやAIとレーティングを競います</p>
                  </div>
                </div>
              </button>
              <button
                onClick={() => {
                  setGameMode("room");
                  setCurrentScreen("room_select");
                }}
                className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 p-4 text-left shadow-lg transition-transform active:scale-95"
              >
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-3 bg-black/20 rounded-xl text-blue-100">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-lg text-white">ルーム戦</div>
                    <p className="text-xs text-blue-100/80">4桁ナンバーで友達と同卓</p>
                  </div>
                </div>
              </button>
            </div>
          </main>
        )}

        {/* --- 2. プロフィール画面 --- */}
        {currentScreen === "profile" && (
          <main className="flex-1 p-3 flex flex-col pt-4 overflow-y-auto bg-slate-950">
            <div className="w-full bg-slate-800 rounded-3xl p-5 border border-slate-700 shadow-xl space-y-6 mb-4">
              <div className="text-center space-y-3 pb-4 border-b border-slate-700">
                <h2 className="text-lg font-bold flex justify-center items-center gap-2">
                  <User className="w-5 h-5 text-amber-400" /> プロフィール
                </h2>
                <input
                  type="text"
                  maxLength={12}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-center text-xl font-black bg-slate-900 border border-slate-700 rounded-xl py-3 text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleUpdateProfile}
                  disabled={!editName.trim() || isSavingProfile || editName === userProfile.name}
                  className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl shadow-md flex justify-center items-center gap-2 text-sm transition-colors"
                >
                  {isSavingProfile ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSavingProfile ? "保存中..." : "名前を更新"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-center items-center gap-1 text-[10px] text-slate-400 mb-1">
                    <Trophy className="w-3 h-3 text-amber-400" />
                    現在レート
                  </div>
                  <div className="text-xl font-bold text-white">{userProfile.rating}</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-center items-center gap-1 text-[10px] text-slate-400 mb-1">
                    最高レート
                  </div>
                  <div className="text-xl font-bold text-emerald-400">{userProfile.peakRating}</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-center items-center gap-1 text-[10px] text-slate-400 mb-1">
                    <Flame className="w-3 h-3 text-rose-400" />
                    現在連勝
                  </div>
                  <div className="text-xl font-bold text-white">{userProfile.currentWinStreak}</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                  <div className="flex justify-center items-center gap-1 text-[10px] text-slate-400 mb-1">
                    最高連勝
                  </div>
                  <div className="text-xl font-bold text-rose-400">{userProfile.maxWinStreak}</div>
                </div>
              </div>

              <div className="mt-4 pt-6 border-t border-slate-700">
                <h3 className="flex justify-center items-center gap-2 text-amber-400 font-bold mb-4 text-sm">
                  <Medal className="w-5 h-5" /> グローバルランキング (Top 50)
                </h3>
                {leaderboard.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 mb-4 text-center text-xs font-semibold text-amber-200">
                    あなたの順位:{" "}
                    <span className="text-lg font-black">
                      {leaderboard.findIndex((p) => p.id === user?.uid) + 1}
                    </span>{" "}
                    位
                  </div>
                )}
                <div className="space-y-2">
                  {leaderboard.slice(0, 50).map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex justify-between items-center p-3 rounded-xl border ${
                        player.id === user?.uid
                          ? "bg-slate-700 border-amber-500/50 sticky bottom-0 top-0 z-10"
                          : "bg-slate-900 border-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 text-center font-black ${
                            index === 0
                              ? "text-amber-400 text-lg"
                              : index === 1
                              ? "text-slate-300"
                              : index === 2
                              ? "text-amber-700"
                              : "text-slate-500 text-sm"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-slate-200 flex items-center gap-1">
                            {player.name}
                            {player.isAI && <Bot className="w-3 h-3 text-indigo-400" />}
                            {player.id === user?.uid && "(あなた)"}
                          </div>
                        </div>
                      </div>
                      <div className="font-black text-emerald-400 text-sm">
                        {player.peakRating || player.rating}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        )}

        {/* --- 3. フレンド画面 --- */}
        {currentScreen === "friends" && (
          <main className="flex-1 p-4 flex flex-col overflow-y-auto">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" /> フレンド管理
            </h2>
            <div className="flex border-b border-slate-700 mb-4 shrink-0">
              <button
                onClick={() => setFriendTab("list")}
                className={`flex-1 py-2 text-sm font-bold border-b-2 ${
                  friendTab === "list"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-slate-400"
                }`}
              >
                フレンド一覧 ({friendsList.length})
              </button>
              <button
                onClick={() => setFriendTab("requests")}
                className={`flex-1 py-2 text-sm font-bold border-b-2 relative ${
                  friendTab === "requests"
                    ? "border-amber-400 text-amber-400"
                    : "border-transparent text-slate-400"
                }`}
              >
                承認待ち
                {pendingRequests.length > 0 && (
                  <span className="absolute top-2 right-4 bg-rose-500 text-white text-[9px] px-1.5 rounded-full">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {friendTab === "list" && (
                <div className="space-y-2">
                  {friendsList.length === 0 ? (
                    <p className="text-center text-xs text-slate-500 py-8">まだフレンドがいません。</p>
                  ) : (
                    friendsList.map((friend) => (
                      <div
                        key={friend.id}
                        className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-700 flex justify-center items-center font-bold text-xs">
                            {friend.name[0]}
                          </div>
                          <span className="font-bold text-sm text-slate-200">{friend.name}</span>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm(`「${friend.name}」を削除しますか？`)) {
                              removeOrDeclineFriend(friend.id);
                            }
                          }}
                          className="p-1.5 bg-slate-900 text-rose-400 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
              {friendTab === "requests" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 mb-2">届いている申請</h3>
                    {pendingRequests.length === 0 && (
                      <p className="text-xs text-slate-500 py-2">申請はありません</p>
                    )}
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex justify-between items-center mb-2"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-900/50 text-indigo-400 border border-indigo-700 flex justify-center items-center font-bold text-xs">
                            {req.name[0]}
                          </div>
                          <span className="font-bold text-sm text-slate-200">{req.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => acceptFriendRequest(req.id, req.name)}
                            className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> 承認
                          </button>
                          <button
                            onClick={() => removeOrDeclineFriend(req.id)}
                            className="px-2 py-1 bg-slate-900 text-slate-400 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 mb-2 mt-4">送信済みの申請</h3>
                    {sentRequests.length === 0 && (
                      <p className="text-xs text-slate-500 py-2">送信中はありません</p>
                    )}
                    {sentRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center mb-2"
                      >
                        <span className="text-sm text-slate-400 flex items-center gap-2">
                          <Clock className="w-3 h-3" /> {req.name} に申請中...
                        </span>
                        <button
                          onClick={() => removeOrDeclineFriend(req.id)}
                          className="text-[10px] text-rose-400 px-2 py-1 bg-rose-950/30 rounded"
                        >
                          取消
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        )}

        {/* --- 4. ルーム選択 --- */}
        {currentScreen === "room_select" && (
          <main className="flex-1 p-4 flex flex-col justify-center">
            <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 shadow-xl space-y-6">
              <div className="flex border-b border-slate-700 pb-3">
                <button
                  onClick={() => setIsCreatingRoom(false)}
                  className={`flex-1 py-2 font-bold text-sm rounded-lg transition-colors ${
                    !isCreatingRoom ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  ルームに参加
                </button>
                <button
                  onClick={() => setIsCreatingRoom(true)}
                  className={`flex-1 py-2 font-bold text-sm rounded-lg transition-colors ${
                    isCreatingRoom ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  新規作成
                </button>
              </div>
              {!isCreatingRoom ? (
                <div className="space-y-4">
                  <label className="block text-xs font-semibold text-slate-300">
                    4桁のルームナンバー
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    className="w-full text-center text-3xl font-mono bg-slate-900 border border-slate-700 rounded-xl py-3 text-amber-400 focus:outline-none"
                  />
                  <button
                    disabled={roomCodeInput.length !== 4}
                    onClick={() => createRoomBase("room")}
                    className="w-full bg-emerald-600 disabled:bg-slate-700 text-white font-bold py-3 rounded-xl shadow-md flex justify-center items-center gap-2"
                  >
                    <LogIn className="w-5 h-5" /> 待機ロビーに入る
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 text-center">
                    新しいルームを開設します。参加者全員が準備完了したらゲームを開始できます。
                  </p>
                  <button
                    onClick={() => createRoomBase("room")}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl flex justify-center items-center gap-2"
                  >
                    <PlusCircle className="w-5 h-5" /> ルームを開設して待機
                  </button>
                </div>
              )}
            </div>
          </main>
        )}

        {/* --- 5. 待機ロビー --- */}
        {currentScreen === "lobby" && (
          <main className="flex-1 p-4 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-md text-center">
                <span className="text-xs text-slate-400 uppercase font-semibold">
                  ROOM CODE
                </span>
                <div className="flex justify-center items-center gap-2 mt-1">
                  <span className="text-3xl font-mono font-black text-amber-400">
                    {currentRoomCode}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 bg-slate-700 rounded-lg text-slate-200"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 shadow-md">
                <div className="flex justify-between items-center pb-3 border-b border-slate-700 mb-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span className="font-bold text-sm">
                      参加メンバー ({roomData?.players?.length || 0}/6)
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {roomData?.players?.map((player) => (
                    <div
                      key={player.id}
                      className="flex justify-between items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-800"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex justify-center items-center font-bold text-xs border border-slate-700">
                          {player.name[0]}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-200 flex items-center gap-1">
                            {player.name}
                            {player.isAI && <Bot className="w-3 h-3 text-indigo-400" />}
                            {player.id === roomData.hostId && (
                              <Crown className="w-3 h-3 text-amber-400" />
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Rate: {player.rating}
                          </div>
                        </div>
                      </div>
                      <div>
                        {player.isReady ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            準備完了
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            待機中
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-4">
              {roomData?.hostId === user?.uid ? (
                <button
                  onClick={handleStartGame}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl flex justify-center items-center gap-2 shadow-lg transition-transform active:scale-95"
                >
                  <Sparkles className="w-5 h-5 fill-slate-950" />
                  {roomData?.mode === "ranked"
                    ? "対戦を開始 (不足分はAI自動補充)"
                    : "対戦を開始 (配牌)"}
                </button>
              ) : (
                <button
                  onClick={toggleReady}
                  className={`w-full font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 shadow-lg transition-transform active:scale-95 ${
                    myPlayerData?.isReady
                      ? "bg-slate-700 text-slate-300"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {myPlayerData?.isReady ? "準備完了を解除" : "準備完了"}
                </button>
              )}
            </div>
          </main>
        )}

        {/* --- 6. ゲームプレイ画面 --- */}
        {currentScreen === "game" && (
          <main className="flex-1 flex flex-col justify-between relative bg-gradient-to-b from-slate-950 via-emerald-950 to-slate-950 p-2 overflow-hidden">
            <div className="relative w-full h-[400px] sm:h-[480px] my-auto flex items-center justify-center shrink-0">
              <div className="absolute inset-2 border-8 border-emerald-900/80 rounded-[90px] bg-emerald-800/90 shadow-2xl z-0 ring-1 ring-emerald-400/20" />
              
              <div className="absolute top-8 z-10 text-center bg-black/40 px-3 py-1 rounded-xl border border-white/10 backdrop-blur-sm">
                <span className="text-[9px] text-emerald-200 uppercase font-bold tracking-widest block">
                  POT: ${roomData?.pot || 0} ({roomData?.phase?.toUpperCase()})
                </span>
                <div className="text-xs font-semibold text-amber-300">
                  Call: ${roomData?.currentCall || 0}
                </div>
              </div>
              
              <div className="absolute top-22 z-10 flex gap-1 p-1.5 bg-black/20 rounded-xl border border-white/5 backdrop-blur-xs">
                {roomData?.communityCards && roomData.communityCards.length > 0 ? (
                  roomData.communityCards.map((card, idx) => (
                    <Card key={idx} rank={card.rank} suit={card.suit} />
                  ))
                ) : (
                  <div className="text-xs text-emerald-200/60 py-3 px-4 font-semibold">
                    Pre-Flop (Betting...)
                  </div>
                )}
              </div>

              {roomData?.players
                ?.filter((p) => p.id !== user?.uid)
                .map((player, idx) => {
                  const positions = [
                    "top-1 left-1/2 transform -translate-x-1/2",
                    "top-14 left-1",
                    "top-14 right-1",
                    "bottom-28 left-1",
                    "bottom-28 right-1",
                  ];
                  const isCurrentTurn =
                    roomData?.players?.[roomData?.turnIndex]?.id === player.id;
                  return (
                    <PlayerSeat
                      key={player.id}
                      name={player.name}
                      chips={player.chips}
                      rating={player.rating}
                      cards={[{ hidden: true }, { hidden: true }]}
                      isDealer={player.id === roomData.hostId}
                      isFolded={player.isFolded}
                      isCurrent={isCurrentTurn}
                      position={positions[idx % positions.length]}
                      isAI={player.isAI}
                    />
                  );
                })}
              
              <PlayerSeat
                name={userProfile.name}
                chips={myPlayerData?.chips || 2000}
                rating={userProfile.rating}
                cards={myPlayerData?.cards || []}
                isCurrent={isMyTurn}
                isDealer={roomData?.hostId === user?.uid}
                isFolded={myPlayerData?.isFolded}
                isUser={true}
                position="bottom-1 left-1/2 transform -translate-x-1/2"
              />
            </div>

            <div className="bg-slate-900/95 border-t border-slate-800 rounded-t-3xl p-3 space-y-3 z-20 shadow-2xl shrink-0">
              <div className="flex justify-between items-center text-xs px-1">
                <div
                  className={`font-bold flex items-center gap-1 ${
                    isMyTurn ? "text-amber-400" : "text-slate-500"
                  }`}
                >
                  <Clock className={`w-4 h-4 ${isMyTurn ? "animate-spin" : ""}`} />
                  {isMyTurn ? "あなたのターン" : "相手のアクション待ち..."}
                </div>
                <div className="w-24 bg-slate-800 h-2 rounded-full border border-slate-700 overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-1000"
                    style={{ width: `${(timeLeft / 15) * 100}%` }}
                  />
                </div>
              </div>

              {isMyTurn && !myPlayerData?.isFolded && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Raise: ${raiseAmount}</span>
                    <span>Max: ${myPlayerData?.chips}</span>
                  </div>
                  <input
                    type="range"
                    min={(roomData?.currentCall || 0) + 50}
                    max={myPlayerData?.chips || 2000}
                    step={50}
                    value={raiseAmount}
                    onChange={(e) => setRaiseAmount(Number(e.target.value))}
                    className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  disabled={!isMyTurn || myPlayerData?.isFolded}
                  onClick={() => executePlayerAction(currentRoomCode, user.uid, "fold")}
                  className="bg-rose-600/90 disabled:opacity-40 hover:bg-rose-500 text-white font-black py-3 rounded-xl text-sm shadow-md active:scale-95 transition-transform"
                >
                  FOLD
                </button>
                <button
                  disabled={!isMyTurn || myPlayerData?.isFolded}
                  onClick={() => executePlayerAction(currentRoomCode, user.uid, "call")}
                  className="bg-blue-600 disabled:opacity-40 hover:bg-blue-500 text-white font-black py-3 rounded-xl text-sm shadow-md flex flex-col items-center justify-center leading-none"
                >
                  <span>CALL</span>
                  <span className="text-[10px] font-normal mt-0.5">
                    $
                    {Math.max(
                      0,
                      (roomData?.currentCall || 0) - (myPlayerData?.currentBet || 0)
                    )}
                  </span>
                </button>
                <button
                  disabled={!isMyTurn || myPlayerData?.isFolded}
                  onClick={() =>
                    executePlayerAction(currentRoomCode, user.uid, "raise", raiseAmount)
                  }
                  className="bg-amber-500 disabled:opacity-40 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-sm shadow-md flex flex-col items-center justify-center leading-none"
                >
                  <span>RAISE</span>
                  <span className="text-[10px] font-bold mt-0.5">
                    ${raiseAmount}
                  </span>
                </button>
              </div>
            </div>
          </main>
        )}

        {/* --- 7. 対戦結果（リザルト）画面 --- */}
        {currentScreen === "result" && matchResult && (
          <main className="flex-1 p-4 flex flex-col justify-center items-center relative bg-slate-950 overflow-y-auto">
            <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center space-y-6 mt-4">
              <div
                className={`inline-flex p-3 rounded-full border mb-2 ${
                  matchResult.isWin
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-slate-800 border-slate-700 text-slate-500"
                }`}
              >
                {matchResult.isWin ? (
                  <Award className="w-10 h-10" />
                ) : (
                  <Swords className="w-10 h-10" />
                )}
              </div>
              
              <div>
                <h2
                  className={`text-2xl font-black ${
                    matchResult.isWin ? "text-amber-400" : "text-slate-400"
                  }`}
                >
                  {matchResult.isWin ? "YOU WIN!" : "SHOWDOWN"}
                </h2>
                <p className="text-xs text-amber-300 font-bold mt-1">
                  勝者: {matchResult.winnerName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  決まり手: {matchResult.handName}
                </p>
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>獲得ポット</span>
                  <span
                    className={
                      matchResult.isWin ? "text-emerald-400 font-bold" : "text-slate-500"
                    }
                  >
                    {matchResult.isWin ? `+$${matchResult.potWon}` : "$0"}
                  </span>
                </div>
                {gameMode === "ranked" && (
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                    <span className="text-slate-300">レーティング変動</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        matchResult.change >= 0 ? "text-amber-400" : "text-rose-500"
                      }`}
                    >
                      {matchResult.change >= 0 ? "+" : ""}
                      {matchResult.change}
                      <span className="text-xs text-slate-500 font-normal">
                        ({matchResult.newRating})
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 text-left">
                <p className="text-xs text-slate-400 font-semibold mb-3 flex items-center gap-1">
                  <UserPlus className="w-4 h-4 text-indigo-400" /> 同卓プレイヤー
                </p>
                <div className="space-y-2">
                  {matchResult.opponents?.map((opp) => {
                    if (opp.isAI) {
                      return (
                        <div
                          key={opp.id}
                          className="flex justify-between items-center bg-slate-800/80 p-2 rounded-xl border border-slate-700"
                        >
                          <span className="text-sm font-semibold text-slate-200 flex items-center gap-1">
                            <Bot className="w-3 h-3 text-indigo-400" /> {opp.name}
                          </span>
                          <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-1 rounded-md">
                            AI Player
                          </span>
                        </div>
                      );
                    }

                    const friendStatus = friendsList.find((f) => f.id === opp.id)
                      ? "accepted"
                      : sentRequests.find((f) => f.id === opp.id)
                      ? "sent"
                      : pendingRequests.find((f) => f.id === opp.id)
                      ? "pending"
                      : null;

                    return (
                      <div
                        key={opp.id}
                        className="flex justify-between items-center bg-slate-800/80 p-2 rounded-xl border border-slate-700"
                      >
                        <span className="text-sm font-semibold text-slate-200">
                          {opp.name}
                        </span>
                        {friendStatus === "accepted" ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950 px-2 py-1 rounded-md flex items-center gap-1">
                            <UserCheck className="w-3 h-3" /> フレンド
                          </span>
                        ) : friendStatus === "sent" ? (
                          <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-1 rounded-md">
                            申請済み
                          </span>
                        ) : friendStatus === "pending" ? (
                          <span className="text-[10px] text-amber-400 bg-amber-950 px-2 py-1 rounded-md">
                            申請が届いています
                          </span>
                        ) : (
                          <button
                            onClick={() => sendFriendRequest(opp.id, opp.name)}
                            className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <UserPlus className="w-3 h-3" /> 申請
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 space-y-2 w-full">
                {gameMode === "ranked" ? (
                  <>
                    <button
                      onClick={handleNextRankedMatch}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all"
                    >
                      次のランク戦へ
                    </button>
                    <button
                      onClick={handleLeaveRoom}
                      className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all"
                    >
                      メインメニューへ戻る
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setCurrentScreen("lobby")}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all"
                  >
                    ロビーへ戻る
                  </button>
                )}
              </div>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}


