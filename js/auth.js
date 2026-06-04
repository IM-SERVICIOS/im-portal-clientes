const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
});

    if(error){
        document.getElementById("mensaje").innerText = error.message;
        return;
    }

    window.location.href = "dashboard.html";
});
