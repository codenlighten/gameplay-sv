import React, { useState, useEffect } from 'react';
import { Brain, Wallet, Trophy, AlertCircle, Check, Coins } from 'lucide-react';
import confetti from 'canvas-confetti';

declare global {
  interface Window {
    SmartLedger: {
      bsv: any;
    };
  }
}

const questions = [
  {
    question: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correct: 2
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correct: 1
  },
  {
    question: "What is the largest mammal in the world?",
    options: ["African Elephant", "Blue Whale", "Giraffe", "White Rhinoceros"],
    correct: 1
  },
  {
    question: "Who painted the Mona Lisa?",
    options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
    correct: 2
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Ag", "Fe", "Au", "Cu"],
    correct: 2
  }
];

function App() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [userWif, setUserWif] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [platformAddress, setPlatformAddress] = useState('');
  const [platformBalance, setPlatformBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customWif, setCustomWif] = useState('');
  const [showCustomWif, setShowCustomWif] = useState(false);
  const [lastRewardTxId, setLastRewardTxId] = useState('');
  const [showRewardMessage, setShowRewardMessage] = useState(false);
  const [showFullWif, setShowFullWif] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);

  const bsv = window.SmartLedger.bsv;

  useEffect(() => {
    initializePlatformWallet();
    const storedWif = localStorage.getItem('userWif');
    if (storedWif) {
      initializeUserWallet(storedWif);
    }
  }, []);

  const triggerCelebration = () => {
    setShowCelebration(true);
    
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 1000,
    };

    function fire(particleRatio: number, opts: any) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    fire(0.2, {
      spread: 60,
    });

    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });

    setTimeout(() => {
      setShowCelebration(false);
    }, 5000);
  };

  const initializePlatformWallet = async () => {
    try {
      const platformWif = import.meta.env.VITE_BSV_WIF;
      if (!platformWif) {
        throw new Error('Platform WIF not configured');
      }

      const privateKey = bsv.PrivateKey.fromWIF(platformWif);
      const publicKey = bsv.PublicKey.fromPrivateKey(privateKey);
      const addr = bsv.Address.fromPublicKey(publicKey).toString();
      
      setPlatformAddress(addr);
      await updateBalance(addr, setPlatformBalance);
    } catch (err) {
      setError('Failed to initialize platform wallet: ' + (err as Error).message);
    }
  };

  const generateNewWallet = () => {
    try {
      const newPrivateKey = bsv.PrivateKey.fromRandom();
      const newWif = newPrivateKey.toWIF();
      localStorage.setItem('userWif', newWif);
      initializeUserWallet(newWif);
      setShowCustomWif(false);
    } catch (err) {
      setError('Failed to generate new wallet: ' + (err as Error).message);
    }
  };

  const initializeUserWallet = async (wif: string) => {
    try {
      setLoading(true);
      setError('');
      setBalanceError('');
      
      const privateKey = bsv.PrivateKey.fromWIF(wif);
      const publicKey = bsv.PublicKey.fromPrivateKey(privateKey);
      const addr = bsv.Address.fromPublicKey(publicKey).toString();
      
      setUserWif(wif);
      setUserAddress(addr);
      localStorage.setItem('userWif', wif);
      
      await updateBalance(addr, setUserBalance);
      setShowCustomWif(false);
    } catch (err) {
      setError('Failed to initialize user wallet: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const updateBalance = async (addr: string, setBalance: (balance: number | null) => void) => {
    try {
      setBalanceError('');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${addr}/balance`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const balance = (data.confirmed || 0) + (data.unconfirmed || 0);
      setBalance(balance);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching balance:', errorMessage);
      
      if (errorMessage.includes('aborted')) {
        setBalanceError('Balance fetch timed out. Please try again.');
      } else {
        setBalanceError('Unable to fetch balance. The service might be temporarily unavailable.');
      }
      
      setBalance(0); // Set balance to 0 as fallback
    }
  };

  const sendReward = async () => {
    if (!userAddress) return;
    
    try {
      setLoading(true);
      setError('');
      setBalanceError('');

      const response = await fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${platformAddress}/unspent`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch UTXOs (${response.status})`);
      }

      const utxos = await response.json();
      
      if (!Array.isArray(utxos) || utxos.length === 0) {
        throw new Error('No UTXOs available in platform wallet');
      }

      const platformPrivateKey = bsv.PrivateKey.fromWIF(import.meta.env.VITE_BSV_WIF);
      const tx = new bsv.Transaction()
        .from(utxos.map((utxo: any) => ({
          txId: utxo.tx_hash,
          outputIndex: utxo.tx_pos,
          satoshis: utxo.value,
          script: bsv.Script.buildPublicKeyHashOut(platformAddress).toString()
        })))
        .feePerKb(10)
        .to(userAddress, 5)
        .change(platformAddress)
        .sign(platformPrivateKey);

      const broadcastResponse = await fetch('https://api.whatsonchain.com/v1/bsv/main/tx/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txhex: tx.toString() })
      });

      if (!broadcastResponse.ok) {
        throw new Error('Failed to broadcast transaction');
      }

      const broadcastData = await broadcastResponse.json();
      setLastRewardTxId(broadcastData);
      setShowRewardMessage(true);
      triggerCelebration();

      // Update balances after successful transaction
      setTimeout(async () => {
        await updateBalance(platformAddress, setPlatformBalance);
        await updateBalance(userAddress, setUserBalance);
      }, 2000); // Wait 2 seconds for transaction to propagate
    } catch (err) {
      setError('Failed to send reward: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (selectedOption: number) => {
    if (loading) return;

    const correct = selectedOption === questions[currentQuestion].correct;
    
    if (correct) {
      setScore(score + 1);
      if (platformAddress && (platformBalance || 0) >= 5) {
        await sendReward();
      }
    } else {
      setShowRewardMessage(false);
      setLastRewardTxId('');
    }

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      setGameOver(true);
    }
  };

  const resetGame = () => {
    setCurrentQuestion(0);
    setScore(0);
    setGameOver(false);
    setShowRewardMessage(false);
    setLastRewardTxId('');
  };

  const getBlurredWif = (wif: string) => {
    if (!wif) return '';
    const start = wif.slice(0, 4);
    const end = wif.slice(-4);
    return `${start}${'•'.repeat(wif.length - 8)}${end}`;
  };

  const formatBalance = (balance: number | null) => {
    if (balance === null) return '...';
    return `${balance} satoshis`;
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Wallet Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-semibold">Wallets</h2>
          </div>
          
          {/* Platform Wallet Info */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Platform Wallet</h3>
            <div className="text-sm text-gray-600">
              <p>Address: {platformAddress || '...'}</p>
              <p>Balance: {formatBalance(platformBalance)}</p>
            </div>
          </div>

          {/* User Wallet Section */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Your Wallet</h3>
            {userAddress ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p>Your Address: {userAddress}</p>
                  <p>Your Balance: {formatBalance(userBalance)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="font-mono text-xs">
                      WIF: {showFullWif ? userWif : getBlurredWif(userWif)}
                    </p>
                    <button
                      onClick={() => setShowFullWif(!showFullWif)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      {showFullWif ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCustomWif(true)}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                  >
                    Use Custom WIF
                  </button>
                  <button
                    onClick={generateNewWallet}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                  >
                    Generate New Wallet
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {showCustomWif ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customWif}
                      onChange={(e) => setCustomWif(e.target.value)}
                      placeholder="Enter your WIF"
                      className="w-full p-2 border rounded"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => initializeUserWallet(customWif)}
                        disabled={!customWif}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        Use Custom WIF
                      </button>
                      <button
                        onClick={generateNewWallet}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                      >
                        Generate New Wallet
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCustomWif(true)}
                      className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                    >
                      Use Custom WIF
                    </button>
                    <button
                      onClick={generateNewWallet}
                      className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
                    >
                      Generate New Wallet
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {balanceError && (
            <div className="flex items-center gap-2 text-orange-600 mt-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm">{balanceError}</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 mt-2">
              <AlertCircle className="w-4 h-4" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {showRewardMessage && lastRewardTxId && (
            <div className={`transform transition-all duration-500 ${showCelebration ? 'scale-110' : 'scale-100'}`}>
              <div className="flex items-center gap-3 text-green-600 mt-4 p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <div className="flex-shrink-0">
                  <Coins className="w-8 h-8" />
                </div>
                <div className="flex-grow">
                  <p className="font-bold text-lg mb-1">Congratulations! 🎉</p>
                  <p className="text-sm mb-2">You've earned 5 satoshis for your correct answer!</p>
                  <p className="text-xs text-green-700">
                    Transaction ID: {' '}
                    <a 
                      href={`https://whatsonchain.com/tx/${lastRewardTxId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {lastRewardTxId}
                    </a>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quiz Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          {!gameOver ? (
            <>
              <div className="flex items-center gap-2 mb-6">
                <Brain className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-semibold">Question {currentQuestion + 1} of {questions.length}</h2>
              </div>
              
              <p className="text-lg mb-6">{questions[currentQuestion].question}</p>
              
              <div className="space-y-3">
                {questions[currentQuestion].options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={loading}
                    className={`w-full p-3 text-left rounded-lg border transition-colors
                      ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-50 active:bg-blue-100'}
                    `}
                  >
                    {option}
                  </button>
                ))}
              </div>
              
              <div className="mt-4 text-sm text-gray-600">
                Current Score: {score}/{currentQuestion + 1}
              </div>
            </>
          ) : (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                <Trophy className="w-16 h-16 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Game Over!</h2>
              <p className="text-lg mb-6">Final Score: {score}/{questions.length}</p>
              <button
                onClick={resetGame}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
