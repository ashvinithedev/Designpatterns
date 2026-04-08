import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  Zap, 
  ArrowRight, 
  Code2, 
  Server, 
  Cloud, 
  CheckCircle2, 
  Info,
  Layers,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// C# Code Snippets
const CODE_SNIPPETS = {
  models: {
    order: `using System;
using System.Text.Json.Serialization;

namespace OutboxPattern.Models
{
    public class Order
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("orderId")]
        public string OrderId { get; set; }

        [JsonPropertyName("customerId")]
        public string CustomerId { get; set; }

        [JsonPropertyName("totalAmount")]
        public decimal TotalAmount { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("partitionKey")]
        public string PartitionKey { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = "Order";

        [JsonPropertyName("_etag")]
        public string ETag { get; set; }
    }
}`,
    outbox: `using System;
using System.Text.Json.Serialization;

namespace OutboxPattern.Models
{
    public class OutboxEvent
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [JsonPropertyName("messageId")]
        public string MessageId { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; } = "OutboxEvent";

        [JsonPropertyName("eventType")]
        public string EventType { get; set; }

        [JsonPropertyName("payload")]
        public string Payload { get; set; }

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        [JsonPropertyName("partitionKey")]
        public string PartitionKey { get; set; }

        [JsonPropertyName("ttl")]
        public int Ttl { get; set; } = 86400; // 24 hours in seconds
    }
}`
  },
  writer: `using System;
using System.Net;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Azure.Cosmos;
using OutboxPattern.Models;

namespace OutboxPattern.Services
{
    public class OrderService
    {
        private readonly Container _container;

        public OrderService(CosmosClient cosmosClient, string databaseName, string containerName)
        {
            _container = cosmosClient.GetContainer(databaseName, containerName);
        }

        public async Task CreateOrderAsync(Order order)
        {
            // Prepare the Outbox Event
            var outboxEvent = new OutboxEvent
            {
                MessageId = Guid.NewGuid().ToString(),
                EventType = "OrderCreated",
                Payload = JsonSerializer.Serialize(order),
                PartitionKey = order.PartitionKey
            };

            // Start Transactional Batch
            // Both documents must have the same Partition Key
            TransactionalBatch batch = _container.CreateTransactionalBatch(new PartitionKey(order.PartitionKey))
                .CreateItem(order)
                .CreateItem(outboxEvent);

            using TransactionalBatchResponse response = await batch.ExecuteAsync();

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Failed to create order and outbox event. Status: {response.StatusCode}");
            }
        }

        public async Task UpdateOrderAsync(Order order)
        {
            // Prepare the Outbox Event
            var outboxEvent = new OutboxEvent
            {
                MessageId = Guid.NewGuid().ToString(),
                EventType = "OrderUpdated",
                Payload = JsonSerializer.Serialize(order),
                PartitionKey = order.PartitionKey
            };

            // Implement Optimistic Concurrency using ETag
            ItemRequestOptions requestOptions = new ItemRequestOptions { IfMatchEtag = order.ETag };

            TransactionalBatch batch = _container.CreateTransactionalBatch(new PartitionKey(order.PartitionKey))
                .ReplaceItem(order.Id, order, requestOptions)
                .CreateItem(outboxEvent);

            using TransactionalBatchResponse response = await batch.ExecuteAsync();

            if (response.StatusCode == HttpStatusCode.PreconditionFailed)
            {
                throw new Exception("Optimistic concurrency violation: The order has been modified by another process.");
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Failed to update order and outbox event. Status: {response.StatusCode}");
            }
        }
    }
}`,
  relay: `using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Azure.Messaging.ServiceBus;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using OutboxPattern.Models;

namespace OutboxPattern.Functions
{
    public class OutboxRelayFunction
    {
        private readonly ILogger _logger;

        public OutboxRelayFunction(ILoggerFactory loggerFactory)
        {
            _logger = loggerFactory.CreateLogger<OutboxRelayFunction>();
        }

        [Function("OutboxRelay")]
        [ExponentialBackoffRetry(5, "00:00:05", "00:05:00")]
        public async Task Run(
            [CosmosDBTrigger(
                databaseName: "OrdersDb",
                containerName: "Orders",
                Connection = "CosmosDBConnection",
                LeaseContainerName = "leases",
                CreateLeaseContainerIfNotExists = true)] IReadOnlyList<OutboxEvent> input,
            [ServiceBusOutput("orders-topic", Connection = "ServiceBusConnection")] IAsyncCollector<ServiceBusMessage> output)
        {
            if (input != null && input.Any())
            {
                _logger.LogInformation($"Processing {input.Count} documents from Change Feed");

                foreach (var doc in input)
                {
                    // Filter: Only process OutboxEvents
                    if (doc.Type == "OutboxEvent")
                    {
                        var message = new ServiceBusMessage(doc.Payload)
                        {
                            // Map Cosmos MessageId to Service Bus MessageId for Duplicate Detection
                            MessageId = doc.MessageId,
                            Subject = doc.EventType,
                            ApplicationProperties = 
                            {
                                { "PartitionKey", doc.PartitionKey },
                                { "CreatedAt", doc.CreatedAt }
                            }
                        };

                        await output.AddAsync(message);
                        
                        _logger.LogInformation($"Message Relayed: {doc.MessageId} (Type: {doc.EventType})");
                    }
                }
            }
        }
    }
}`
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'models' | 'writer' | 'relay'>('writer');

  return (
    <div className="min-h-screen bg-[#0F1115] text-slate-300 font-sans selection:bg-blue-500/30">
      {/* Background Grid Effect */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-20" />

      <div className="relative max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-4"
          >
            <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <Layers className="w-6 h-6 text-blue-400" />
            </div>
            <span className="text-xs font-mono tracking-widest text-blue-400 uppercase">Architecture Pattern</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl font-bold text-white mb-6 tracking-tight"
          >
            Transactional Outbox <span className="text-blue-500">Pattern</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-slate-400 max-w-3xl leading-relaxed"
          >
            Ensuring reliable message delivery in distributed systems by atomically persisting state changes 
            and events within the same database transaction.
          </motion.p>
        </header>

        {/* Architecture Diagram Simulation */}
        <section className="mb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <ArchitectureStep 
              icon={<Server className="w-6 h-6" />}
              title="Atomic Writer"
              desc="Web API writes Business Entity + Outbox Event to Cosmos DB in one Transactional Batch."
              delay={0.3}
            />
            <div className="flex justify-center">
              <motion.div 
                animate={{ x: [0, 10, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-slate-600"
              >
                <ArrowRight className="w-8 h-8" />
              </motion.div>
            </div>
            <ArchitectureStep 
              icon={<Cloud className="w-6 h-6" />}
              title="Change Feed Relay"
              desc="Azure Function monitors Change Feed and relays events to Service Bus."
              delay={0.5}
            />
          </div>
        </section>

        {/* Main Content Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1 space-y-4">
            <TabButton 
              active={activeTab === 'models'} 
              onClick={() => setActiveTab('models')}
              icon={<Database className="w-5 h-5" />}
              label="Data Models"
              sub="POCOs & Attributes"
            />
            <TabButton 
              active={activeTab === 'writer'} 
              onClick={() => setActiveTab('writer')}
              icon={<Zap className="w-5 h-5" />}
              label="Atomic Writer"
              sub="TransactionalBatch SDK"
            />
            <TabButton 
              active={activeTab === 'relay'} 
              onClick={() => setActiveTab('relay')}
              icon={<MessageSquare className="w-5 h-5" />}
              label="The Relay"
              sub="CosmosDBTrigger"
            />

            <div className="mt-12 p-6 bg-slate-800/30 rounded-2xl border border-slate-700/50">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                Production Ready
              </h3>
              <ul className="space-y-3 text-xs text-slate-400">
                <li className="flex gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  Optimistic Concurrency (ETags)
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  Auto-cleanup with 24h TTL
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  Exponential Backoff Retry
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                  Managed Identity Auth
                </li>
              </ul>
            </div>
          </div>

          {/* Code Display Area */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-[#1E1E1E] rounded-2xl border border-slate-700/50 overflow-hidden shadow-2xl"
              >
                <div className="px-6 py-4 bg-[#252526] border-bottom border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-mono text-slate-300">
                      {activeTab === 'models' ? 'Models/Order.cs' : activeTab === 'writer' ? 'Services/OrderService.cs' : 'Functions/OutboxRelayFunction.cs'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
                    <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/40" />
                  </div>
                </div>
                
                <div className="p-0 max-h-[600px] overflow-y-auto custom-scrollbar">
                  <SyntaxHighlighter
                    language="csharp"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: '1.5rem',
                      fontSize: '0.9rem',
                      background: 'transparent',
                    }}
                    showLineNumbers
                  >
                    {activeTab === 'models' ? CODE_SNIPPETS.models.order : activeTab === 'writer' ? CODE_SNIPPETS.writer : CODE_SNIPPETS.relay}
                  </SyntaxHighlighter>
                </div>

                {activeTab === 'models' && (
                  <div className="border-t border-slate-700/50 p-0">
                    <div className="px-6 py-3 bg-[#252526] border-b border-slate-700/50 flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-mono text-slate-300">Models/OutboxEvent.cs</span>
                    </div>
                    <SyntaxHighlighter
                      language="csharp"
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '1.5rem',
                        fontSize: '0.9rem',
                        background: 'transparent',
                      }}
                      showLineNumbers
                    >
                      {CODE_SNIPPETS.models.outbox}
                    </SyntaxHighlighter>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Explanation Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="mt-8 p-8 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex gap-6"
            >
              <div className="p-3 bg-blue-500/10 rounded-xl h-fit">
                <Info className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white mb-2">Architect's Note</h4>
                <p className="text-slate-400 leading-relaxed">
                  The key to this pattern is the <span className="text-blue-400 font-mono">TransactionalBatch</span>. 
                  By writing both the business state and the event to the same logical partition, we guarantee 
                  that either both succeed or both fail. This eliminates the "dual-write" problem where a 
                  database update succeeds but the message queue notification fails.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1E1E1E;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #333;
          border-radius: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #444;
        }
      `}} />
    </div>
  );
}

function ArchitectureStep({ icon, title, desc, delay }: { icon: React.ReactNode, title: string, desc: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="p-8 bg-slate-800/40 rounded-3xl border border-slate-700/50 text-center group hover:border-blue-500/30 transition-colors"
    >
      <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-blue-400 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon, label, sub }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, sub: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 flex items-center gap-4 ${
        active 
          ? 'bg-blue-500/10 border-blue-500/50 text-white shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
          : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700 hover:bg-slate-800/20'
      }`}
    >
      <div className={`p-2 rounded-lg ${active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-600'}`}>
        {icon}
      </div>
      <div>
        <div className="font-bold">{label}</div>
        <div className="text-xs opacity-60">{sub}</div>
      </div>
    </button>
  );
}
