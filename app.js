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
    /* console.log(validation.error.message); */
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
    console.log("limit");
    console.log(limit);
    const messages = await messagesCollection.find({$or:[{to: 'Todos'}, {from: user}, {to: user}]})
                                              .sort({_id:-1})
                                              .limit(limit)
                                              .toArray();
    await endConection();
    res.send(messages.reverse());
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
    console.log(validation.error.message); //apagar depois
    res.sendStatus(422);
    return;
  }

  try {
    await startConection();
    const participantsCollection = db.collection('participants');
    const userExists = await participantsCollection.findOne({name: from});
    if (!userExists) {
      await endConection();
      console.log("O remetente da mensagem não existe."); //remover depois
      res.sendStatus(422);
      return;
    }
    const messagesCollection = db.collection('messages');
    await messagesCollection.insertOne(message);
    await endConection();
    res.sendStatus(201); 
    return;
  } catch (error) {
    await endConection();
    res.sendStatus(500);
    return;
  }
});

app.listen(5000, () => {
  console.log("🛰️  Servidor iniciado na porta 5000.");
});