using System;
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
}
