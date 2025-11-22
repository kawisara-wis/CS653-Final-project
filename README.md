# CS631-Final-project
To share the multi-agent system of the warehouse management prototype. We have built MAS on Langchain Framework and used Langgraph as the orchestrator.

Our purpose: 
1. We would like to use LLM and AI Model to support decision-making and better utilize the capacity of the warehouse
2. Exploring the efficiency of LLM in the real-world use case. 

Step of testing:

First, you need to create a visual environment "python3 -m venv venv" --> "source venv/bin/activate".

Second, you have to install the involved tools "pip install langchain langgraph requests pydantic googlemaps pandas pymongo".

Third, you need to generate Google Maps API Key, OpenAI API Key, and MongoDB URI and put them in .env file.

Fourth, you can adjust the value of the parameters in .env file as you prefer.

Finally, you can start testing the multi-agent system.
