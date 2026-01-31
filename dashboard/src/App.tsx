import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { encryptKey } from './lib/crypto'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Plus, Shield, ShieldCheck, Activity, Zap, Key, Copy, ExternalLink } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'

interface Agent {
  id: string;
  name: string;
  budget_limit: number;
  current_spend: number;
  status: 'active' | 'paused' | 'frozen';
  api_key_hash: string;
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [vaultExists, setVaultExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  // Form states
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentBudget, setNewAgentBudget] = useState('10');
  const [masterKey, setMasterKey] = useState('');
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [isSettingVault, setIsSettingVault] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [spendingAgents, setSpendingAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!session) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: agentsData } = await supabase.from('agents').select('*').order('created_at', { ascending: false });
      const { data: vaultData } = await supabase.from('users_vault').select('user_id').maybeSingle();
      
      if (agentsData) setAgents(agentsData);
      if (vaultData) setVaultExists(true);
      setLoading(false);
    };

    fetchDashboardData();

    // Subscribe to Realtime updates for spend tracking
    const subscription = supabase
      .channel('agents-realtime')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'agents',
        filter: session ? `user_id=eq.${session.user.id}` : undefined
      }, (payload) => {
        // Update Agent Data
        setAgents(current => current.map(agent => 
          agent.id === payload.new.id ? { ...agent, ...payload.new } : agent
        ));

        // Trigger Spending Pulse
        setSpendingAgents(prev => {
          const next = new Set(prev);
          next.add(payload.new.id);
          return next;
        });

        // Remove Pulse after 1.5s
        setTimeout(() => {
          setSpendingAgents(prev => {
            const next = new Set(prev);
            next.delete(payload.new.id);
            return next;
          });
        }, 1500);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [session]);

  const handleCreateAgent = async () => {
    if (!session || !newAgentName) {
      toast.error('Agent name is required');
      return;
    }
    
    const agKey = `ag_sk_${crypto.randomUUID().replace(/-/g, '')}`;
    
    const { data, error } = await supabase.from('agents').insert({
      user_id: session.user.id,
      name: newAgentName,
      api_key_hash: agKey,
      budget_limit: parseFloat(newAgentBudget),
      current_spend: 0,
    }).select().single();

    if (error) {
      toast.error(error.message);
    } else {
      setAgents([data, ...agents]);
      setGeneratedKey(agKey);
      setNewAgentName('');
      setIsCreatingAgent(false);
      toast.success('Agent key provisioned successfully');
    }
  };

  const handleSetupVault = async () => {
    if (!session || !masterKey) return;
    
    const promise = (async () => {
      const { encrypted, iv } = await encryptKey(masterKey, session.user.id);
      const { error } = await supabase.from('users_vault').upsert({
        user_id: session.user.id,
        encrypted_provider_key: encrypted,
        encryption_iv: iv,
      });
      if (error) throw error;
      setVaultExists(true);
      setMasterKey('');
      setIsSettingVault(false);
    })();

    toast.promise(promise, {
      loading: 'Securing your key in the vault...',
      success: 'Vault secured successfully',
      error: (err) => `Failed to secure vault: ${err.message}`,
    });
  };

  const handleDeleteAgent = async (id: string) => {
    const { error } = await supabase.from('agents').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      setAgents(agents.filter(a => a.id !== id));
      toast.success('Agent key invalidated');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Email Login Handlers
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleEmailLogin = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthLoading(false);
    if (error) toast.error(error.message);
  };

  const handleEmailSignUp = async () => {
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Check your email for the confirmation link!');
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4">
        <Toaster position="bottom-right" theme="dark" richColors />
        <div className="max-w-md w-full text-center space-y-8">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-xl mb-4">
            <Shield className="w-12 h-12 text-zinc-200" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Agmoney</h1>
          <p className="text-zinc-400">The Financial Guardian for AI Agents.</p>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Input 
                type="email" 
                placeholder="Email" 
                className="bg-zinc-900/50 border-zinc-800"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input 
                type="password" 
                placeholder="Password" 
                className="bg-zinc-900/50 border-zinc-800"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline"
                className="w-full border-zinc-800 hover:bg-zinc-900"
                onClick={handleEmailSignUp}
                disabled={authLoading}
              >
                Sign Up
              </Button>
              <Button 
                className="w-full bg-white text-black hover:bg-zinc-200"
                onClick={handleEmailLogin}
                disabled={authLoading}
              >
                Sign In
              </Button>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-950 px-2 text-zinc-500">Or continue with</span>
              </div>
            </div>

            <Button 
              className="w-full h-10 font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800" 
              onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })}
            >
              GitHub
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-zinc-800 selection:text-white">
      <Toaster position="bottom-right" theme="dark" richColors />
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-zinc-900/50 bg-zinc-950/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-white" />
            <span className="font-bold text-xl tracking-tight text-white glow-text">Agmoney</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 hidden md:inline">{session.user.email}</span>
            <Button variant="ghost" className="text-zinc-400 hover:text-white hover:bg-zinc-900/50" onClick={() => supabase.auth.signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="glass-card animate-glow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Active Agents</CardTitle>
                <Zap className="w-4 h-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white tabular-nums tracking-tight">{agents.length}</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Monthly Spend</CardTitle>
                <Activity className="w-4 h-4 text-zinc-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white tabular-nums tracking-tight">
                  ${agents.reduce((acc, a) => acc + Number(a.current_spend), 0).toFixed(4)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">Vault Status</CardTitle>
                {vaultExists ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Key className="w-4 h-4 text-amber-500" />}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white tracking-tight">
                  {vaultExists ? 'Secured' : 'Needs Setup'}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Vault Setup Reminder */}
        {!vaultExists && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h3 className="font-semibold text-amber-500 flex items-center gap-2">
                <Key className="w-4 h-4" /> Finalize Setup
              </h3>
              <p className="text-sm text-amber-500/80">Connect your OpenAI Master Key to "The Vault" to start creating agents.</p>
            </div>
            <Dialog open={isSettingVault} onOpenChange={setIsSettingVault}>
              <DialogTrigger asChild>
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-xl shadow-amber-500/20">
                  Open Vault
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-zinc-800 text-white shadow-2xl">
                <DialogHeader>
                  <DialogTitle>The Vault</DialogTitle>
                  <DialogDescription className="text-zinc-400 text-xs">
                    Enter your OpenAI Master Key. We encrypt it with AES-256 before storing. We only decrypt it ephemeral memory during proxy requests.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">OpenAI API Key (sk-...)</label>
                    <Input 
                      type="password" 
                      placeholder="sk-..." 
                      className="bg-black/50 border-zinc-800 focus:border-zinc-500 transition-colors"
                      value={masterKey}
                      onChange={(e) => setMasterKey(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSetupVault} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">Save to Vault</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}

        {/* Agents List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-white glow-text">Guardian Agents</h2>
            <Dialog open={isCreatingAgent} onOpenChange={setIsCreatingAgent}>
              <DialogTrigger asChild>
                <Button className="bg-white text-black hover:bg-zinc-200 font-semibold" disabled={!vaultExists}>
                  <Plus className="w-4 h-4 mr-2" /> Create Agent
                </Button>
              </DialogTrigger>
              <DialogContent className="glass border-zinc-800 text-white">
                <DialogHeader>
                  <DialogTitle>Create New Agent</DialogTitle>
                  <DialogDescription className="text-zinc-400 text-xs">
                    Provision a unique Agmoney key with a strict budget limit.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Agent Name</label>
                    <Input 
                      placeholder="e.g. Research Bot" 
                      className="bg-black/50 border-zinc-800 focus:border-zinc-500 transition-colors"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Budget Limit (USD)</label>
                    <Input 
                      type="number" 
                      placeholder="10.00" 
                      className="bg-black/50 border-zinc-800 focus:border-zinc-500 transition-colors"
                      value={newAgentBudget}
                      onChange={(e) => setNewAgentBudget(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateAgent} className="w-full bg-emerald-600 hover:bg-emerald-700">Generate Agent Key</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Success Key Modal */}
          <Dialog open={!!generatedKey} onOpenChange={() => setGeneratedKey(null)}>
            <DialogContent className="glass border-zinc-800 text-white shadow-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ShieldCheck className="text-emerald-500"/> Agent Created!</DialogTitle>
                <DialogDescription className="text-zinc-400 text-xs">
                  Copy this key now. For your security, we won't show it again in full.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div className="flex items-center gap-2 p-4 rounded-xl bg-black border border-zinc-800 ring-1 ring-white/5">
                  <span className="font-mono text-sm break-all text-emerald-400 flex-1">
                    {generatedKey}
                  </span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-zinc-500 hover:text-white"
                    onClick={() => generatedKey && copyToClipboard(generatedKey)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-[10px] text-zinc-500 flex items-center gap-1 uppercase tracking-widest font-bold">
                  Target: <code className="text-zinc-300 font-mono lower-case">https://api.agmoney.dev/v1</code> <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setGeneratedKey(null)} className="w-full bg-zinc-100 text-black hover:bg-zinc-300 font-bold">Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {loading ? (
            <div className="flex py-24 items-center justify-center text-zinc-500 text-sm font-mono tracking-widest">
              [ SCANNING_NETWORK_SECURITY ]
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-4 rounded-3xl border border-dashed border-zinc-800 bg-zinc-900/10 text-center space-y-4">
              <div className="p-4 rounded-full bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                <Shield className="w-12 h-12 text-zinc-700" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-medium text-zinc-200">System Offline</h3>
                <p className="text-sm text-zinc-500 max-w-sm">Create your first autonomous agent to activate the financial firewall.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {agents.map((agent, index) => (
                  <motion.div
                    key={agent.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="glass-card group h-full flex flex-col">
                      <CardHeader className="flex-none">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg text-white font-bold flex items-center gap-2">
                              {agent.name}
                              {spendingAgents.has(agent.id) && (
                                <motion.div 
                                  initial={{ scale: 0 }} 
                                  animate={{ scale: [1, 1.2, 1] }} 
                                  transition={{ repeat: Infinity, duration: 0.8 }}
                                  className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"
                                />
                              )}
                            </CardTitle>
                            <CardDescription className="font-mono text-[10px] mt-1 text-zinc-600 block truncate max-w-[150px]">
                              {agent.id}
                            </CardDescription>
                          </div>
                          <div className={`text-[9px] font-black tracking-tighter px-2 py-0.5 rounded-full border shadow-sm ${
                            agent.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                            agent.status === 'paused' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            'bg-rose-500/10 border-rose-500/20 text-rose-400'
                          }`}>
                            {agent.status.toUpperCase()}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-5 flex-1">
                        <div className="space-y-3">
                          <div className="flex justify-between text-[10px] uppercase font-bold tracking-widest">
                            <span className="text-zinc-600">Budget Utilization</span>
                            <span className="text-zinc-300 tabular-nums">
                              ${Number(agent.current_spend).toFixed(4)} 
                              <span className="text-zinc-700 mx-1">/</span> 
                              <span className="text-zinc-500">${agent.budget_limit}</span>
                            </span>
                          </div>
                          <div className="relative h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
                             <motion.div 
                               className={`absolute top-0 left-0 h-full rounded-full ${
                                 (Number(agent.current_spend) / agent.budget_limit) > 0.9 ? 'bg-rose-500' : 'bg-emerald-500'
                               }`}
                               initial={{ width: 0 }}
                               animate={{ width: `${Math.min((Number(agent.current_spend) / agent.budget_limit) * 100, 100)}%` }}
                               transition={{ type: 'spring', stiffness: 50 }}
                             />
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2 flex justify-between gap-3 flex-none">
                        <Button variant="ghost" size="sm" className="bg-zinc-900/30 text-zinc-500 hover:text-white hover:bg-zinc-800/50 text-[10px] w-full border border-zinc-800/50 uppercase tracking-widest font-bold">
                          Deactivate
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteAgent(agent.id)} className="bg-rose-950/20 text-rose-500/40 hover:text-rose-400 hover:bg-rose-950/40 text-[10px] w-full border border-rose-900/20 uppercase tracking-widest font-bold">
                          Terminate
                        </Button>
                      </CardFooter>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}


