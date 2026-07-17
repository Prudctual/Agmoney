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
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 mesh-bg opacity-40"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        
        <Toaster position="bottom-right" theme="dark" richColors />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full relative z-10"
        >
          <div className="glass p-8 rounded-2xl border-white/10 shadow-2xl">
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-zinc-900/50 border border-t-white/10 border-b-black/50 backdrop-blur-xl shadow-lg mb-2 relative group cursor-default">
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-2xl blur-lg group-hover:blur-xl transition-all duration-500 opacity-0 group-hover:opacity-100"></div>
                  <Shield className="w-12 h-12 text-emerald-500 relative z-10 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
              </div>
              
              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400">Agmoney</h1>
                <p className="text-zinc-400 text-sm">The Financial Guardian for AI Agents.</p>
              </div>
              
              <div className="space-y-4 pt-4">
                <div className="space-y-3">
                  <Input 
                    type="email" 
                    placeholder="Email address" 
                    className="bg-black/20 border-white/5 focus:border-emerald-500/50 h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input 
                    type="password" 
                    placeholder="Password" 
                    className="bg-black/20 border-white/5 focus:border-emerald-500/50 h-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button 
                    variant="ghost"
                    className="w-full border border-white/5 hover:border-white/10 hover:bg-white/5 text-zinc-300"
                    onClick={handleEmailSignUp}
                    disabled={authLoading}
                  >
                    Create Account
                  </Button>
                  <Button 
                    variant="premium"
                    className="w-full"
                    onClick={handleEmailLogin}
                    disabled={authLoading}
                  >
                    Sign In
                  </Button>
                </div>
                
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/5" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                    <span className="bg-transparent px-2 text-zinc-600">Or continue with</span>
                  </div>
                </div>

                <Button 
                  variant="outline"
                  className="w-full h-11 font-medium bg-black/20 border-white/5 hover:bg-white/5 hover:text-white" 
                  onClick={() => supabase.auth.signInWithOAuth({ provider: 'github' })}
                >
                  GitHub
                </Button>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-8 text-xs text-zinc-600 font-mono">
            SECURED BY AGMONEY GUARDIAN PROXY
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-emerald-500/30 selection:text-emerald-200 relative">
      <div className="fixed inset-0 mesh-bg opacity-30 pointer-events-none"></div>
      <Toaster position="bottom-right" theme="dark" richColors />
      
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
                <div className="absolute inset-0 bg-emerald-500 blur-md opacity-20"></div>
                <Shield className="w-6 h-6 text-emerald-500 relative" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">Agmoney</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-mono text-zinc-500 hidden md:inline bg-white/5 px-3 py-1 rounded-full border border-white/5">{session.user.email}</span>
            <Button variant="ghost" size="sm" className="text-zinc-400 hover:text-white" onClick={() => supabase.auth.signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8 relative z-10">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="glass-card group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">Active Agents</CardTitle>
                <div className="p-2 rounded-lg bg-emerald-500/10 group-hover:bg-emerald-500/20 transition-colors">
                    <Zap className="w-4 h-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white tabular-nums tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left drop-shadow-lg">{agents.length}</div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">Monthly Spend</CardTitle>
                <div className="p-2 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                    <Activity className="w-4 h-4 text-indigo-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white tabular-nums tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left drop-shadow-lg">
                  ${agents.reduce((acc, a) => acc + Number(a.current_spend), 0).toFixed(4)}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="glass-card group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">Vault Status</CardTitle>
                <div className={`p-2 rounded-lg transition-colors ${vaultExists ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    {vaultExists ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : <Key className="w-4 h-4 text-amber-500" />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-white tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left drop-shadow-lg">
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
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-white">Guardian Agents</h2>
            <Dialog open={isCreatingAgent} onOpenChange={setIsCreatingAgent}>
              <DialogTrigger asChild>
                <Button variant="premium" disabled={!vaultExists} className="shadow-emerald-500/10">
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
                      className="bg-black/50 border-zinc-800 focus:border-emerald-500/50 transition-colors"
                      value={newAgentName}
                      onChange={(e) => setNewAgentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Budget Limit (USD)</label>
                    <Input 
                      type="number" 
                      placeholder="10.00" 
                      className="bg-black/50 border-zinc-800 focus:border-emerald-500/50 transition-colors"
                      value={newAgentBudget}
                      onChange={(e) => setNewAgentBudget(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateAgent} variant="premium" className="w-full">Generate Agent Key</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Success Key Modal */}
          <Dialog open={!!generatedKey} onOpenChange={() => setGeneratedKey(null)}>
            <DialogContent className="glass border-zinc-800 text-white shadow-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-emerald-400"><ShieldCheck className="w-5 h-5"/> Agent Securely Provisioned</DialogTitle>
                <DialogDescription className="text-zinc-400 text-xs">
                  Copy this key now. For your security, we won't show it again in full.
                </DialogDescription>
              </DialogHeader>
              <div className="py-6 space-y-4">
                <div className="flex items-center gap-2 p-4 rounded-xl bg-black border border-emerald-500/20 ring-1 ring-emerald-500/10">
                  <span className="font-mono text-sm break-all text-emerald-400 flex-1">
                    {generatedKey}
                  </span>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-zinc-500 hover:text-emerald-400"
                    onClick={() => generatedKey && copyToClipboard(generatedKey)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <div className="text-[10px] text-zinc-500 flex items-center gap-1 uppercase tracking-widest font-bold">
                  Target: <code className="text-zinc-300 font-mono lower-case">https://api.agmoney.aiandthings.tech/v1</code> <ExternalLink className="w-3 h-3 ml-1" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setGeneratedKey(null)} className="w-full bg-zinc-100 text-black hover:bg-zinc-200 font-bold">Done</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {loading ? (
            <div className="flex py-32 items-center justify-center text-zinc-500 text-sm font-mono tracking-widest flex-col gap-4">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin"></div>
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
                    <Card className="glass-card group h-full flex flex-col bg-zinc-900/40 hover:bg-zinc-900/60 transition-all duration-300">
                      <CardHeader className="flex-none">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-lg text-white font-bold flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                              {agent.name}
                              {spendingAgents.has(agent.id) && (
                                <motion.div 
                                  initial={{ scale: 0 }} 
                                  animate={{ scale: [1, 1.2, 1] }} 
                                  transition={{ repeat: Infinity, duration: 0.8 }}
                                  className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                                />
                              )}
                            </CardTitle>
                            <CardDescription className="font-mono text-[10px] text-zinc-600 block truncate max-w-[150px] bg-black/20 px-1.5 py-0.5 rounded-md border border-white/5">
                              {agent.id}
                            </CardDescription>
                          </div>
                          <div className={`text-[9px] font-black tracking-tighter px-2.5 py-1 rounded-full border shadow-sm ${
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
                            <span className="text-zinc-500">Utilization</span>
                            <span className="text-zinc-300 tabular-nums">
                              ${Number(agent.current_spend).toFixed(4)} 
                              <span className="text-zinc-700 mx-1">/</span> 
                              <span className="text-zinc-500">${agent.budget_limit}</span>
                            </span>
                          </div>
                          <div className="relative h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                             <motion.div 
                               className={`absolute top-0 left-0 h-full rounded-full ${
                                 (Number(agent.current_spend) / agent.budget_limit) > 0.9 ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_10px_#f43f5e]' : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_10px_#10b981]'
                               }`}
                               initial={{ width: 0 }}
                               animate={{ width: `${Math.min((Number(agent.current_spend) / agent.budget_limit) * 100, 100)}%` }}
                               transition={{ type: 'spring', stiffness: 50 }}
                             />
                          </div>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2 flex justify-between gap-3 flex-none opacity-60 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="bg-zinc-900/30 text-zinc-500 hover:text-white hover:bg-zinc-800/50 text-[10px] w-full border border-zinc-800/50 uppercase tracking-widest font-bold">
                          Pause
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteAgent(agent.id)} className="bg-rose-950/10 text-rose-500/40 hover:text-rose-400 hover:bg-rose-950/30 text-[10px] w-full border border-rose-900/10 hover:border-rose-900/30 uppercase tracking-widest font-bold">
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


