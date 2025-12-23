import { prisma } from '../src/db/client.js';
import { createDonation } from '../src/services/financeService.js';
import { createProposal, castVote } from '../src/services/votingService.js';

async function testCore() {
    console.log('Testing Core Logic...');
    
    // 1. Setup User
    const email = 'core_test@example.com';
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                email,
                handle: 'core_tester',
                role: 'admin',
                totalDonated: 0
            }
        });
        console.log('Created test user:', user.email);
    } else {
        console.log('Using existing user:', user.email);
    }

    // 2. Test Donation
    console.log('Testing Donation...');
    const initialTotal = user.totalDonated || 0;
    
    try {
        await createDonation({
            amount: 50,
            donorId: user.id,
            donorHandle: user.handle,
            status: 'completed',
            proofUrl: 'manual_script_test'
        });
    } catch (e) {
        console.error('Donation Error:', e.message);
    }
    
    // Verify Update
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    if ((updatedUser.totalDonated || 0) > initialTotal) {
        console.log(`✅ Donation success! Total increased: ${initialTotal} -> ${updatedUser.totalDonated}`);
    } else {
        console.error('❌ Donation failed to update total.');
    }

    // 3. Test Voting
    console.log('Testing Voting...');
    
    // Create Proposal
    let proposal;
    try {
        proposal = await createProposal({
            title: 'Core Logic Test Proposal ' + Date.now(),
            description: 'Testing via script',
            authorHandle: user.handle
        });
        console.log('Created Proposal:', proposal.id);
    } catch (e) {
        console.error('Create Proposal Error:', e.message);
        return;
    }
    
    // Vote Yes
    try {
        await castVote({
            proposalId: proposal.id,
            userHandle: user.handle,
            vote: 'yes'
        });
    } catch (e) {
        console.error('Vote Error:', e.message);
    }
    
    const updatedProposal = await prisma.proposal.findUnique({ where: { id: proposal.id } });
    if (updatedProposal.yesCount === 1) {
         console.log('✅ Vote Yes counted!');
    } else {
         console.error('❌ Vote failed to count.');
    }
    
    console.log('Core Tests Completed.');
    await prisma.$disconnect();
}

testCore().catch(console.error);
