import express, { json } from "express";
import { MongoClient } from "mongodb";
import cors from "cors";
import joi from "joi";
import dotenv from "dotenv";
import dayjs from "dayjs";


const app = express();
app.use(cors());
app.use(json())
dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
db = mongoClient.db("bate-papo-uol");

async function startConection() {
  await mongoClient.connect();
}

async function endConection() {
  await mongoClient.close();
}

//Schemas de validação para os dados recebidos na API
const participantSchema = joi.object({
  name: joi.string().trim().required(),
  lastStatus: joi.number().strict().required()
});

const messageSchema = joi.object({
  from: joi.string().required(),
  to: joi.string().trim().required(),
  text: joi.string().trim().required(),
  type: joi.string().valid('message', 'private_message').required(),
  time: joi.string().required()
});

// Rota /participants 
app.get("/participants", async (_, res) => {
  try {
    await startConection();
    const participantsCollection = db.collection('participants');
    const participants = await participantsCollection.find().toArray();
    await endConection();
    res.send(participants);
  } catch (error) {
    await endConection();
    res.sendStatus(500);
    return;
  }
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;

  const participant = {
    name,
    lastStatus: Date.now()
  }

  const validation = participantSchema.validate(participant, { abortEarly: false });

  if (validation.error) {
    console.log(validation.error.message);
    res.sendStatus(422);
    return;
  }

  try {
    await startConection();
    const participantsCollection = db.collection('participants');
    const userExists = await participantsCollection.findOne({name});
    if (userExists) {
      await endConection();
      res.sendStatus(409);
      return;
    }
    else {
      await participantsCollection.insertOne(participant);
      const messagesCollection = db.collection('messages');
      const time = dayjs().locale('pt-br').format('HH:mm:ss');
      await messagesCollection.insertOne({
        from: name,
        to: 'Todos',
        text: 'entra na sala...',
        type: 'status',
        time
      });
      await endConection();
      res.sendStatus(201);
      return;
    }
  }
  catch (error) {
    await endConection();
    res.sendStatus(500);
    return;
  }
});

//Rota /messages
app.get("/messages", async (req, res) => {
  const limit = parseInt(req.query.limit); //pega a quantidade de mensagens que deve ser mostrada
  const user = req.headers.user; //Pega o nome do usuário vindo do header da requisição
  try {
    await startConection();
    const messagesCollection = db.collection('messages');
    const messages = await messagesCollection.find({
      $or:[
        {to: 'Todos'}, 
        {from: user}, 
        {to: user}, 
        {type: 'message'}
      ]
    })
      .sort({_id:-1})
      .limit(limit)
      .toArray();
    res.send(messages.reverse());
    await endConection();
  } catch (error) {
    await endConection();
    res.sendStatus(500);
    return;
  }
});

app.post("/messages", async (req, res) => {
  const from = req.headers.user; 
  const {to, text, type} = req.body;
  const time = dayjs().locale('pt-br').format('HH:mm:ss');
  const message = {
    from,
    to,
    text, 
    type,
    time
  };
  const validation = messageSchema.validate(message, { abortEarly: false });

  if (validation.error) {
    console.log(validation.error.message);
    res.sendStatus(422);
    return;
  }

  try {
    await startConection();
    const participantsCollection = db.collection('participants');
    const userExists = await participantsCollection.findOne({name: from});
    if (!userExists) {
      res.sendStatus(422);
      await endConection();
      return;
    }
    const messagesCollection = db.collection('messages');
    await messagesCollection.insertOne(message);
    res.sendStatus(201); 
    await endConection();
    return;
  } catch (error) {
    res.sendStatus(500);
    await endConection();
    return;
  }
});

app.post("/status", async (req, res) => {
  const user = req.headers.user; 

  try {
    await startConection();
    const participantsCollection = db.collection('participants');
    const userExists = await participantsCollection.findOne({name: user});
    if (!userExists) {
      res.sendStatus(404);
      await endConection();
      return;
    }
    else{
      await participantsCollection.updateOne(
        {name: user}, 
        {
          $set: {lastStatus: Date.now()}
        }
      );
      await endConection();
      res.sendStatus(200); 
      return;
    }
  } catch (error) {
    await endConection();
    res.sendStatus(500);
    return;
  }
});

setInterval(async () => {
  const tempoAtual = Date.now();
  const usuariosParaRemover = [];
  try {
    await startConection();
    const participants  = await db.collection('participants').find({}).toArray();
    participants.map((participant) => {
      if ((tempoAtual - participant.lastStatus) >= 10000) {
        usuariosParaRemover.push(participant);
      }
    });

    usuariosParaRemover.map( async (participant)=>{
        await db.collection("participants").deleteOne({ _id: participant._id })
        const time = dayjs().locale('pt-br').format('HH:mm:ss');
        await db.collection('messages').insertOne({ 
          from: participant.name, 
          to: "Todos", 
          text: 'sai da sala...', 
          type: 'status', 
          time 
        })
    });
      
  } catch (error) {
    console.log(error);
  }
}, 15000);

app.listen(5000, () => {
  console.log("🛰️  Servidor iniciado na porta 5000.");
});
