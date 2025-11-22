# shr-mfg-cpl-sim

## Consumer

### Properties

### Functions
* rentService

```mermaid
graph TD
    S1(["rentService"])
    S2{{"service in state ACTIVE?"}}
    S3{{"service in state MARKET?"}}
    S4["get or create new service"]
    S5["create new offer direct"]
    S6["send offer direct"]
    
    S1 --> S2
    S2 -->|NO| S3
    S2 -->|YES| R1(["reject"])
    S3 -->|YES| R2(["reject"])
    S3-->|NO| S4
    S4-->S5
    S5-->S6
    S6-->E1(["end"])

```
* clcOfferPrice
* clcOfferDuration
* clcOfferProvider

### Events

* serviceCommenced
* serviceCompleted

```mermaid
graph TD
    E1((("offer direct expired")))
    E2((("offer direct accepted")))
    E3((("offer direct rejected")))
    E4((("offer direct send")))
    S1(("service commenced"))
    S2(("service completed"))
    
```











## Service

### States
```mermaid
graph 
    A[[IDLE]]
    B[[MARKET]]
    D[[ACTIVE]]
    E[[DONE]]

    AA["serviceService.create(consumer)"] --> A
    A --> T1["serviceService.market(service)"] --> B
    T3((("offer direct <br>accepted"))) --> C["serviceService.commence(service)"] 
    C-->T6((service<br>commenced))-->D
    D --> T4{{"&#128336 is completed?"}} --> E
    E-->T5(("service <br>completed"))

    T7((("offer direct <br>rejected")))-->T11[[OFFER_REJECTED]]-->T1
    T8((("offer direct <br>expired")))-->T12[[OFFER_EXPIRED]]-->T1
    

    
```

## Offer direct

### States
```mermaid
graph
    A0(("create"))-->|"serviceOfferDirect.create(service)"|A
    A[[IDLE]]
    B[[MARKET]]
    C[[EXPIRED]]
    D[[ACCEPTED]]
    E[[REJECTED]]
    
    A -->|"serviceOfferDirect.send(offer)"| B
    B-->|"serviceOfferDirect.expire(offer)"|C
    B-->|"serviceOfferDirect.accept(offer)"|D
    B-->|"serviceOfferDirect.reject(offer)"|E
    C --> T4(("offer direct </br> expired"))
    D-->T7((offer direct<br>accepted))
    E-->T8((offer direct<br>rejected))
    
    

```

```mermaid
sequenceDiagram
    title provider accepts offer direct
    Note over A:generate offer
    A->>B:offerDirectReceive(offer)
    Note over B:offer is accepted
    B->>A: offerDirectAccepted(offerDirect)
    Note over B:service in progress
    B->>A: serviceCompleted(service)
```

```mermaid
sequenceDiagram
    title provider rejects offer direct
    participant A as Consumer
    participant B as Provider
    participant C as Pool

    Note over A:generate offer
    A->>B:offerDirectReceive(offer)
    Note over B:offer is rejected
    B->>A: offerDirectRejected(offerDirect)
```

```mermaid
sequenceDiagram
    title provider forwards offer direct to pool
    participant A as Consumer
    participant B as Provider A
    participant C as Pool
    participant D as Provider B
    Note over A: generate offer
    A ->> B: offerDirectReceive(offer)
    alt to pool
        Note over B: generate offer capacity
        B ->> C: offerCapacityPost(offerCapacity)
        C -->> D: event new offer posted
        Note over C: Offer capacity waiting to be picked by others
        alt pulled by provider B
            D ->> C: offerCapacityAccepted(offerCapacity)
            Note over C: Pool remove offer capacity from market
            C ->> B: offerCapacityAccepted(offerCapacity)
            Note over B: offer is accepted
            B ->> A: offerDirectAccepted(offerDirect)
            Note over D: service in progress
            D ->> B: serviceCompleted(service)
            B ->> A: serviceCompleted(service)
        else offer capacity expire
            Note over B: offer capacity expires
        end
    else offer direct expire
        Note over A: offer expires
    end



```



