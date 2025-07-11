const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
dotenv.config();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r4vhlna.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    //DB AND COLLECTION STARTS
    const db = client.db("Assignment_12_DB");
    const articleCollections = db.collection("Articles");
    const usersCollection = db.collection("users");
    const publishersCollection = db.collection("Publishers");
    //DB AND COLLECTION ENDS

    //article(submitted by user) related api starts (PRIVATE_API)
    app.post("/articles", async (req, res) => {
      const articles = req.body;
      const result = await articleCollections.insertOne(articles);
      res.send(result);
    });

    // Trending API Route
    app.get("/articles/trending", async (req, res) => {
      try {
        const trendingArticles = await articleCollections
          .find() // You can change to { status: "approved" } later
          .sort({ views: -1 })
          .limit(6)
          .toArray();

        res.json(trendingArticles);
      } catch (error) {
        console.error("Error fetching trending articles:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });
    //get article details page single data
    app.get("/articles/:id", async (req, res) => {
      const id = req.params.id;

      const article = await articleCollections.findOne({
        _id: new ObjectId(id),
      });
      res.send(article);
    });

    //ARTICLE VIEW COUNT-->
    app.patch("/articles/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await articleCollections.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { views: 1 } }
        );
        if (result.modifiedCount === 0)
          return res.status(404).json({ error: "Article not found" });
        res.json({ message: "View count incremented" });
      } catch (err) {
        res.status(500).json({ error: "Failed to update views" });
      }
    });

    //article(submitted by user) related api ends

    //USER RELATED API STARTS HERE
    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExist = await usersCollection.findOne({ email });
      if (userExist) {
        return res
          .status(200)
          .send({ message: "User already exists", inserted: false });
      }
      const userInfo = req.body;
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //APPROVE ADMIN / UPDATE USER ROLE API

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      try {
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Server error while updating user" });
      }
    });
    //USER RELATED API ENDS HERE
    // ------------------------------------------------------  //
    //PUBLISHER RALTED API STARTS
    app.post("/publishers", async (req, res) => {
      try {
        const { publisherName, publisherPic } = req.body;

        // Simple validation for name and logo
        if (!publisherName || !publisherPic) {
          return res.status(400).json({ error: "Name and logo are required" });
        }

        // publisher data here
        const publisherData = {
          publisherName,
          publisherPic,
          createdAt: new Date().toISOString(),
        };

        // Insert into DB
        const result = await publishersCollection.insertOne(publisherData);

        res.status(201).json({
          message: "Publisher added successfully",
          publisherId: result.insertedId,
        });
      } catch (error) {
        console.error("Failed to add publisher:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    app.get("/publishers", async (req, res) => {
      const result = await publishersCollection.find().toArray();
      res.send(result);
    });

    //OUBLISHER RALTED API ENDS

    //PAYMENT REALTED API START HERE
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const  amount = req.body?.amountInCents; // amount in cents from frontend

        console.log("this is",amount);
        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "Invalid amount" });
        }

        // Create a PaymentIntent with the amount and currency
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd", // or your desired currency
          payment_method_types: ["card"],
        });

        // Send client secret to frontend
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: "Failed to create payment intent" });
      }
    });

    //PAYMENT REALTED API ENDS HERE

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Default  route
app.get("/", (req, res) => {
  res.send("NewsPaper Server is running");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
