using System;
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
}
