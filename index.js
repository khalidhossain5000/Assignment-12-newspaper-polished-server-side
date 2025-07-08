const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
dotenv.config();
const port = process.env.PORT || 3000;

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
      const id=req.params.id
      
      const article = await articleCollections.findOne({ _id: new ObjectId(id) });
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
