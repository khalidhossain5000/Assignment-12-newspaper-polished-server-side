const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const app = express();
dotenv.config();
const port = process.env.PORT || 3000;
const stripe = require("stripe")(process.env.STRIPE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

const serviceAccount = require("./assignment-12-firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    //CUSTOM MIDDLEWARES STARTS
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];

      if (!token)
        return res.status(401).send({ message: "unauthorized access" });
      //VERIFY TOKEN STARTS
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        // Now check premium expiry
        const user = await usersCollection.findOne({ email: decoded.email });
        if (user?.premiumInfo && new Date(user.premiumInfo) < new Date()) {
          //  Expired
          await usersCollection.updateOne(
            { email: decoded.email },
            { $set: { premiumInfo: null } }
          );
        }

        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };
    //CUSTOM MIDDLEWARES ENDS
    //article(submitted by user) related api starts (PRIVATE_API)
    app.post("/articles", verifyFBToken, async (req, res) => {
      const articles = req.body;
      const result = await articleCollections.insertOne(articles);
      res.send(result);
    });

    //ARTICLE VIEW COUNT-->
    app.patch("/articles/view/:id", async (req, res) => {
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
    //UPDATING STATUS API VIA ADMIN ACTIONS BUTTON
    app.patch("/articles/:id", async (req, res) => {
      const articleId = req.params.id;

      // ✅ NEW: Accepting declineReason from frontend
      const { status, declineReason } = req.body;

      // ✅ SAME: Still validates 'status'
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // ✅ NEW: Dynamic update object
      const updateDoc = { status };

      // ✅ NEW: If status is "declined", also set declineReason
      if (status === "declined" && declineReason) {
        updateDoc.declineReason = declineReason;
      }

      // ✅ SAME: Update article using dynamic updateDoc
      const result = await articleCollections.updateOne(
        { _id: new ObjectId(articleId) },
        { $set: updateDoc }
      );

      res.send(result);
    });
    //update my article api start here
    app.patch("/articles/update/:id", async (req, res) => {
      try {
        const articleId = req.params.id;
        const updateData = req.body;

        if (!ObjectId.isValid(articleId)) {
          return res.status(400).json({ error: "Invalid article ID" });
        }

        const result = await articleCollections.updateOne(
          { _id: new ObjectId(articleId) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "Article not found" });
        }

        res.json({ message: "Article updated successfully" });
      } catch (error) {
        console.error("Update article error:", error);
        res.status(500).json({ error: "Server error" });
      }
    });

    //update my article api ends here
    //GETTING APPROVE ARTICLE WITH SEARCH FILTER
    //MY ARTICLE API START HERE
    // GET /api/articles?email=test@admin.com
    app.get("/articles/my-articles", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const articles = await articleCollections
          .find({ authorEmail: email })
          .toArray();

        res.json(articles);
      } catch (error) {
        console.error("Failed to fetch articles:", error);
        res.status(500).json({ error: "Server error" });
      }
    });

    //MY ARTICLE API ENDS HERE
    app.get("/articles/approved", async (req, res) => {
      const search = req.query.search || "";
      const publisher = req.query.publisher || "";
      // const tag = req.query.tag || "";
      const tags = req.query.tags ? req.query.tags.split(",") : [];

      const query = {
        status: "approved",
        articleTitle: { $regex: search, $options: "i" }, // for search
      };

      if (publisher) {
        query["publisher.value"] = publisher; // publisher.value দিয়ে filter
      }
      if (tags.length) {
        query["tags.value"] = { $in: tags }; // tags array এর ভিতরের object এর value দিয়ে match করবে
      }

      const articles = await articleCollections.find(query).toArray();
      res.send(articles);
    });

    //ADMIN API GETTING ALL ARTICLE
    app.get("/articles", verifyFBToken, async (req, res) => {
      const result = await articleCollections.find().toArray();
      res.send(result);
    });
    //GET PREMIUM ARTICLE

    app.get("/articles/premium", verifyFBToken, async (req, res) => {
      try {
        // Step 1: Query to filter only premium articles
        const query = { isPremium: true, status: "approved" }; // শুধুমাত্র approved এবং premium

        // Step 2: Find articles matching query
        const premiumArticles = await articleCollections.find(query).toArray();

        // Step 3: Send the articles back to frontend
        res.status(200).json(premiumArticles);
      } catch (error) {
        console.error("Failed to fetch premium articles:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
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
      const id = req?.params?.id;
      console.log("object,id", id);
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
    // Make article premium
    app.patch("/articles/:id/premium", async (req, res) => {
      const articleId = req.params.id;

      const result = await articleCollections.updateOne(
        { _id: new ObjectId(articleId) },
        { $set: { isPremium: true } }
      );

      res.send(result);
    });

    //ARTICEL DELTE API
    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const result = await articleCollections.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
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

    // /api/user-stats
    app.get("/user-stats", async (req, res) => {
      try {
        const today = new Date();

        const totalUsers = await usersCollection.estimatedDocumentCount(); // all users
        const normalUsers = await usersCollection.countDocuments({
          premiumInfo: null,
        }); // no premium
        // const premiumUsers = await usersCollection.countDocuments({
        //   premiumInfo: { $ne: null, $gt: today }, // has premium and not expired
        // });

        const premiumUsers = await usersCollection.countDocuments({
          premiumInfo: { $ne: null },
          $expr: { $gt: [{ $toDate: "$premiumInfo" }, today] },
        });

        res.send({ totalUsers, normalUsers, premiumUsers });
      } catch (error) {
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.get("/user", async (req, res) => {
      const email = req.query.email; // ইউজারের ইমেইল ইউআরএল থেকে নেবে, যেমন /api/user?email=test@example.com

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      try {
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ error: "User not found" });
        }
        res.send(user);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Server error" });
      }
    });

    //updating user INFO IN THE DB FROM UPDATE PROFILE PAGE
    app.patch("/users", async (req, res) => {
      try {
        const email = req.query.email; // query থেকে email নেওয়া
        const { name, profilePic } = req.body;

        if (!email) {
          return res
            .status(400)
            .json({ error: "Email query parameter is required" });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { name, profilePic } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({ message: "User profile updated successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
      }
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

    //premium field update api
    app.patch("/users/:email", async (req, res) => {
      const email = req.params.email;
      const { premiumInfo } = req.body;

      const filter = { email };
      const updateDoc = {
        $set: { premiumInfo },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
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
        const amount = req.body?.amountInCents; // amount in cents from frontend

        console.log("this is", amount);
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
